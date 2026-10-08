"""AI chat that works out which legal document the user needs and fills it in.

The chat is stateless: each request carries the whole conversation, the chosen
document (if any) and its current field values. The model replies, may choose a
document, and proposes field updates (as a Structured Output), which are validated
and merged into the fields returned to the client.
"""

import json
import logging
import os
import time
from collections.abc import Callable
from datetime import date, timedelta
from functools import cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from litellm import RateLimitError, completion
from pydantic import BaseModel, Field, ValidationError, create_model

from app.auth import current_user
from app.documents import (
    DOCUMENTS,
    CamelModel,
    DocumentData,
    DocumentId,
    DocumentSpec,
    apply_updates,
    carry_over,
    empty_optional_fields,
    missing_required_fields,
    model_name,
    updates_model,
    validate_data,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

MODEL = "openrouter/openai/gpt-oss-120b"
# Only Cerebras: the providers OpenRouter would otherwise fall back to are much slower and handle the schema worse.
EXTRA_BODY = {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
# Plenty for one chat turn; without it OpenRouter reserves credit for the model's maximum.
MAX_TOKENS = 2000
RATE_LIMIT_RETRY_DELAYS = (1, 2, 4)  # seconds
MAX_MESSAGES = 100
MAX_MESSAGE_LENGTH = 4000


# ---------------------------------------------------------------------------
# What the model returns


# A turn before any document has been chosen.
class ChooseTurn(CamelModel):
    reply: str = Field(description="Your message to the user")
    document: DocumentId | None = Field(  # type: ignore[valid-type]
        description="The id of the document to work on, once the user has chosen or confirmed it; otherwise null"
    )


# A turn on a chosen document.
class FillTurn(ChooseTurn):
    # Each document's turn model (fill_turn_model) narrows this to its own updates model. It is
    # declared here so the model writes its updates before the endings, which depend on them.
    updates: BaseModel
    # The model can't reliably tell whether its own updates complete the document, so it writes
    # both endings and the server picks one (see message_for).
    question: str = Field(
        description="A question (ending with a question mark) asking for one or two pieces of required information "
        "that will still be missing after your updates; an empty string if nothing required will be missing"
    )
    ready_message: str = Field(
        description="What to say if nothing required is missing after your updates: that the document is ready to "
        "download with the Download PDF button, and a question about whether to fill in the optional details that are "
        "still empty (name a few) or change anything"
    )

    def message_for(self, spec: DocumentSpec, data: DocumentData) -> str:
        """The reply followed by the question or the ready message, whichever fits the updated fields."""
        missing = missing_required_fields(spec, data)
        if missing:
            ending = self.question.strip() or f"Could you tell me the {missing[0]}?"
        else:
            ending = self.ready_message.strip() or _default_ready_message(spec, data)
        return "\n\n".join(part for part in (self.reply.strip(), ending) if part)


@cache
def fill_turn_model(document_id: str) -> type[FillTurn]:
    return create_model(
        model_name(document_id, "Turn"),
        __base__=FillTurn,
        updates=(updates_model(document_id), Field(description="New values for fields the user has given; null for everything else")),
    )


def turn_model(spec: DocumentSpec | None) -> type[ChooseTurn]:
    return ChooseTurn if spec is None else fill_turn_model(spec.id)


def _default_ready_message(spec: DocumentSpec, data: DocumentData) -> str:
    message = f"Your {spec.name} is ready to download with the Download PDF button."
    if optional := empty_optional_fields(spec, data):
        return f"{message} Would you like to add any optional details ({', '.join(optional[:6])}) or change anything?"
    return f"{message} Would you like to change anything?"


# ---------------------------------------------------------------------------
# Prompt


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


def _catalog() -> str:
    return "\n".join(f"- {spec.id}: {spec.name}. {spec.description}" for spec in DOCUMENTS.values())


SYSTEM_PROMPT = f"""\
You are Prelegal's assistant. You help the user draft a legal agreement based on the Common Paper \
standard agreements, by chatting with them. These are the documents you can draft (id: name. description):
{_catalog()}

Choosing the document:
- If no document has been chosen yet, find out what the user needs and suggest the document that fits, \
with a short reason. Set `document` to its id once the user has confirmed it or clearly asked for it.
- If the user asks for a document that isn't in the list (e.g. an employment contract or a lease), say plainly \
that you can't draft that one, suggest the closest document from the list and what it covers, and ask whether \
they'd like it. Keep `document` null (or unchanged) until they agree.
- If the user wants to switch to another document later, set `document` to its id; details the documents \
share (the parties, dates, governing law, courts and the like) carry over.

How to behave:
- Be friendly, clear and concise. Ask about one or two things at a time, in a natural order.
- Once a document is chosen, the user sees `reply` followed by either `question` (if required information is \
still missing) or `readyMessage` (if nothing required is missing); write both. Keep `reply` to confirming what you \
filled in or answering the user: no questions, and nothing about what's missing or whether the document is ready. \
Don't ask about optional details in `question`.
- Write plain text, not Markdown (no ** or # formatting).
- When the user gives information, put it in `updates`. Set every field you are not changing to null. \
Only change a field when the user has said so; never make values up. Use "" to clear a field the user wants empty.
- Confirm briefly what you filled in. If an answer is ambiguous, ask instead of guessing.
- In `updates`, dates are YYYY-MM-DD; interpret relative dates ("tomorrow", "next Monday") using today's date and weekday. \
In your reply, write dates in words, e.g. "October 12, 2026".
- You can explain what the terms mean, but you don't give legal advice; suggest a lawyer for that.
- The user may also edit the fields directly; the current values below are always the latest.
"""


def describe_document(spec: DocumentSpec) -> str:
    lines = [
        f"The current document is the {spec.name} (id {spec.id}), based on the Common Paper {spec.name} Standard Terms. "
        f"You are filling in its {spec.cover_title}.",
        f"Party 1 is the {spec.parties[0]} and Party 2 is the {spec.parties[1]}. For each: company name (required), "
        "and optionally the signatory's name and title and a notice address (email or postal).",
        "Its fields (blank optional fields print as \"None\"):",
    ]
    for section in spec.sections:
        for field in section.fields:
            kind = "required" if field.required else "optional"
            choices = f" Choices: {', '.join(o.value for o in field.options)}." if field.options else ""
            lines.append(f"- {field.label} [{field.key}, {kind}]: {field.description}.{choices}")
    return "\n".join(lines)


def build_messages(
    conversation: list[ChatMessage], spec: DocumentSpec | None, data: DocumentData | None, today: date, switched: bool = False
) -> list[dict[str, str]]:
    # Models are unreliable at date arithmetic, so give them dates to look up.
    upcoming = ", ".join(f"{day:%A} {day.isoformat()}" for day in (today + timedelta(days=n) for n in range(1, 22)))
    # The status is as of before the user's latest message, which may fill in more.
    state = [
        "Document status before the user's latest message:",
        f"Today's date: {today:%A} {today.isoformat()}",
        f"The next three weeks: {upcoming}",
    ]
    if spec is None or data is None:
        document = "No document has been chosen yet."
        state.append("Current document: none")
    else:
        document = describe_document(spec)
        missing = missing_required_fields(spec, data)
        state += [
            f"Current document: {spec.id}",
            f"Current field values (JSON): {json.dumps(data.model_dump(by_alias=True))}",
            f"Required fields still missing: {', '.join(missing) if missing else 'none'}",
            f"Optional fields still empty: {', '.join(empty_optional_fields(spec, data)) or 'none'}",
        ]
    if switched and spec is not None:
        state.append(
            f"The {spec.name} has just been chosen in response to the user's latest message. Confirm it briefly, fill in "
            "anything the user has already told you that fits its fields, and ask for what's still needed."
        )
    return [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n{document}"},
        {"role": "system", "content": "\n".join(state)},
        *({"role": m.role, "content": m.content} for m in conversation),
    ]


# ---------------------------------------------------------------------------
# The model call, as a dependency so tests can replace it

Llm = Callable[[list[dict[str, str]], type[ChooseTurn]], ChooseTurn]


class LlmError(Exception):
    pass


def _complete(messages: list[dict[str, str]], response_format: type[BaseModel]):
    # Cerebras is sometimes briefly rate limited; wait and retry rather than fail the turn.
    for delay in (*RATE_LIMIT_RETRY_DELAYS, None):
        try:
            return completion(
                model=MODEL,
                messages=messages,
                response_format=response_format,
                reasoning_effort="low",
                max_tokens=MAX_TOKENS,
                extra_body=EXTRA_BODY,
            )
        except RateLimitError:
            if delay is None:
                raise
            time.sleep(delay)


def call_llm[T: ChooseTurn](messages: list[dict[str, str]], response_format: type[T]) -> T:
    try:
        response = _complete(messages, response_format)
        return response_format.model_validate_json(response.choices[0].message.content)
    except ValidationError as e:
        raise LlmError(f"The model's reply didn't match the schema: {e}") from e
    except Exception as e:
        raise LlmError(str(e)) from e


def get_llm() -> Llm:
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The AI assistant isn't set up: OPENROUTER_API_KEY is missing.")
    return call_llm


# ---------------------------------------------------------------------------
# Endpoint


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    document: str | None = None
    fields: DocumentData | None = None
    today: date


class ChatResponse(CamelModel):
    reply: str
    document: str | None
    fields: DocumentData | None


def _current_draft(body: ChatRequest) -> tuple[DocumentSpec | None, DocumentData | None]:
    """The document the request is about (None if none is chosen yet) and its validated fields."""
    if body.document is None:
        return None, None
    if body.document not in DOCUMENTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown document: {body.document}.")
    spec = DOCUMENTS[body.document]
    try:
        return spec, validate_data(spec, body.fields, body.today)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


def _ask(llm: Llm, body: ChatRequest, spec: DocumentSpec | None, data: DocumentData | None, *, switched: bool) -> ChooseTurn:
    try:
        return llm(build_messages(body.messages, spec, data, body.today, switched), turn_model(spec))
    except LlmError:
        logger.exception("Chat completion failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI assistant is unavailable right now. Please try again.")


@router.post("", dependencies=[Depends(current_user)])
def chat(body: ChatRequest, llm: Annotated[Llm, Depends(get_llm)]) -> ChatResponse:
    if body.messages[-1].role != "user":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The last message must be from the user.")
    spec, data = _current_draft(body)

    turn = _ask(llm, body, spec, data, switched=False)
    if turn.document is not None and turn.document != (spec.id if spec else None):
        # The model chose a document. Its updates (if any) were for the old one, so ask again
        # with the new document's fields; that reply also asks the new document's first question.
        new_spec = DOCUMENTS[turn.document]
        data = carry_over(spec, data, new_spec, body.today)
        spec = new_spec
        turn = _ask(llm, body, spec, data, switched=True)

    if spec is None or data is None or not isinstance(turn, FillTurn):
        return ChatResponse(reply=turn.reply.strip(), document=None, fields=None)
    data = apply_updates(spec, data, turn.updates)
    return ChatResponse(reply=turn.message_for(spec, data), document=spec.id, fields=data)
