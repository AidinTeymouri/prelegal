"""AI chat that fills in the Mutual NDA.

The chat is stateless: each request carries the whole conversation and the current
field values. The model replies and proposes field updates (as a Structured Output),
which are validated and merged into the fields returned to the client.
"""

import json
import logging
import os
import time
from collections.abc import Callable
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from litellm import RateLimitError, completion
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from app.auth import current_user

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
MIN_YEARS, MAX_YEARS = 1, 99


class CamelModel(BaseModel):
    """Fields are snake_case in Python and camelCase in JSON, matching the frontend's NdaFormData."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------------------------------------------------------------------------
# The document fields (mirrors NdaFormData in frontend/src/lib/nda.ts)


class Party(CamelModel):
    name: str
    title: str
    company: str
    notice_address: str


class NdaFields(CamelModel):
    purpose: str
    effective_date: str  # yyyy-mm-dd, or "" if not set
    mnda_term_type: Literal["expires", "until-terminated"]
    mnda_term_years: int = Field(ge=MIN_YEARS, le=MAX_YEARS)
    confidentiality_type: Literal["years", "perpetual"]
    confidentiality_years: int = Field(ge=MIN_YEARS, le=MAX_YEARS)
    governing_law: str
    jurisdiction: str
    modifications: str
    party1: Party
    party2: Party


def empty_optional_fields(fields: NdaFields) -> list[str]:
    optional = {"MNDA modifications": fields.modifications}
    for n, party in ((1, fields.party1), (2, fields.party2)):
        optional |= {
            f"Party {n} signatory name": party.name,
            f"Party {n} signatory title": party.title,
            f"Party {n} notice address": party.notice_address,
        }
    return [label for label, value in optional.items() if not value.strip()]


def missing_required_fields(fields: NdaFields) -> list[str]:
    """The fields that must be filled in before the NDA can be downloaded (as in nda.ts)."""
    required = {
        "Purpose": fields.purpose,
        "Effective date": fields.effective_date,
        "Governing law": fields.governing_law,
        "Jurisdiction": fields.jurisdiction,
        "Party 1 company": fields.party1.company,
        "Party 2 company": fields.party2.company,
    }
    return [label for label, value in required.items() if not value.strip()]


# ---------------------------------------------------------------------------
# What the model returns. Every field is required but nullable (null = leave unchanged),
# which keeps the schema valid for strict Structured Outputs.


class PartyUpdate(CamelModel):
    name: str | None = Field(description="Name of the person signing for this party")
    title: str | None = Field(description="Job title of the person signing")
    company: str | None = Field(description="Legal name of the company")
    notice_address: str | None = Field(description="Email or postal address for legal notices")


class FieldUpdates(CamelModel):
    purpose: str | None = Field(description="How Confidential Information may be used")
    effective_date: str | None = Field(description="Effective date as YYYY-MM-DD")
    mnda_term_type: Literal["expires", "until-terminated"] | None
    mnda_term_years: int | None = Field(description="Whole number of years, 1 to 99, when the MNDA term expires")
    confidentiality_type: Literal["years", "perpetual"] | None
    confidentiality_years: int | None = Field(description="Whole number of years, 1 to 99, that information stays confidential")
    governing_law: str | None = Field(description="US state whose laws govern the MNDA, e.g. Delaware")
    jurisdiction: str | None = Field(description="City or county and state for disputes, e.g. New Castle, DE")
    modifications: str | None = Field(description="Any changes to the standard terms; empty string for none")
    party1: PartyUpdate | None
    party2: PartyUpdate | None


class AiTurn(CamelModel):
    reply: str = Field(description="Your message to the user, e.g. confirming what you filled in")
    updates: FieldUpdates = Field(description="New values for fields the user has given; null for everything else")
    # The model can't reliably tell whether its own updates complete the document, so it writes
    # both endings and the server picks one (see message_for).
    question: str = Field(
        description="A question asking for required information that will still be missing after your updates; "
        "an empty string if nothing required will be missing"
    )
    ready_message: str = Field(
        description="What to say if nothing required is missing after your updates: that the NDA is ready to download "
        "with the Download PDF button, and a question about whether to fill in the optional details that are still "
        "empty (name them) or change anything"
    )

    def message_for(self, fields: NdaFields) -> str:
        """The reply followed by the question or the ready message, whichever fits the updated fields."""
        missing = missing_required_fields(fields)
        if missing:
            ending = self.question.strip() or f"Could you tell me the {missing[0].lower()}?"
        else:
            ending = self.ready_message.strip() or _default_ready_message(fields)
        return "\n\n".join(part for part in (self.reply.strip(), ending) if part)


def _default_ready_message(fields: NdaFields) -> str:
    message = "Your NDA is ready to download with the Download PDF button."
    if optional := empty_optional_fields(fields):
        return f"{message} Would you like to add any optional details ({', '.join(optional).lower()}) or change anything?"
    return f"{message} Would you like to change anything?"


def _valid_years(value: int | None) -> bool:
    return value is not None and MIN_YEARS <= value <= MAX_YEARS


def _valid_date(value: str | None) -> bool:
    try:
        return value is not None and len(value) == 10 and bool(date.fromisoformat(value))
    except ValueError:
        return False


def apply_updates(fields: NdaFields, updates: FieldUpdates) -> NdaFields:
    """Merge the model's updates into the fields, ignoring nulls and invalid values."""
    changes: dict[str, object] = {}
    for name in ("purpose", "governing_law", "jurisdiction", "modifications", "mnda_term_type", "confidentiality_type"):
        value = getattr(updates, name)
        if value is not None:
            changes[name] = value.strip()
    if _valid_date(updates.effective_date):
        changes["effective_date"] = updates.effective_date
    for name in ("mnda_term_years", "confidentiality_years"):
        if _valid_years(getattr(updates, name)):
            changes[name] = getattr(updates, name)
    for name in ("party1", "party2"):
        party_updates: PartyUpdate | None = getattr(updates, name)
        if party_updates is not None:
            party: Party = getattr(fields, name)
            party_changes = {k: v.strip() for k, v in party_updates.model_dump().items() if v is not None}
            changes[name] = party.model_copy(update=party_changes)
    return fields.model_copy(update=changes)


# ---------------------------------------------------------------------------
# Prompt


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


SYSTEM_PROMPT = """\
You are Prelegal's assistant. You help the user fill in a Mutual Non-Disclosure Agreement (MNDA) \
based on the Common Paper Mutual NDA Standard Terms (Version 1.0), by chatting with them.

The document has these fields:
- Purpose: how Confidential Information may be used. It starts with a generic default; when the user says why they are sharing information, \
replace it with a short sentence describing that (e.g. "Exploring a joint product development project between the parties.").
- Effective date: when the MNDA starts.
- MNDA term: either expires a number of years after the effective date, or continues until terminated.
- Term of confidentiality: how long information stays protected: a number of years after the effective date, or in perpetuity.
- Governing law: the US state whose laws apply. Jurisdiction: the city or county and state where disputes are heard.
- MNDA modifications: optional changes to the standard terms.
- For each of the two parties: company name, and optionally the signatory's name and title and a notice address (email or postal).

How to behave:
- Be friendly, clear and concise. Ask about one or two things at a time, in a natural order.
- After `reply`, the user sees either `question` (if required information is still missing) or `readyMessage` \
(if nothing required is missing); write both. Don't ask about optional details in `question`.
- When the user gives information, put it in `updates`. Set every field you are not changing to null. \
Only change a field when the user has said so; never make values up. Use "" to clear a field the user wants empty.
- Confirm briefly what you filled in. If an answer is ambiguous, ask instead of guessing.
- In `updates`, dates are YYYY-MM-DD; interpret relative dates ("tomorrow", "next Monday") using today's date and weekday. \
In your reply, write dates in words, e.g. "October 12, 2026".
- You can explain what the terms mean, but you don't give legal advice; suggest a lawyer for that.
- If the user asks for something else, briefly say you can only help with this Mutual NDA.
- The user may also edit the fields directly; the current values below are always the latest.
"""


def build_messages(conversation: list[ChatMessage], fields: NdaFields, today: date) -> list[dict[str, str]]:
    missing = missing_required_fields(fields)
    # Models are unreliable at date arithmetic, so give them dates to look up.
    upcoming = ", ".join(f"{day:%A} {day.isoformat()}" for day in (today + timedelta(days=n) for n in range(1, 22)))
    # The status is as of before the user's latest message, which may fill in more.
    state = (
        "Document status before the user's latest message:\n"
        f"Today's date: {today:%A} {today.isoformat()}\n"
        f"The next three weeks: {upcoming}\n"
        f"Current field values (JSON): {json.dumps(fields.model_dump(by_alias=True))}\n"
        f"Required fields still missing: {', '.join(missing) if missing else 'none'}\n"
        f"Optional fields still empty: {', '.join(empty_optional_fields(fields)) or 'none'}"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": state},
        *({"role": m.role, "content": m.content} for m in conversation),
    ]


# ---------------------------------------------------------------------------
# The model call, as a dependency so tests can replace it

Llm = Callable[[list[dict[str, str]]], AiTurn]


class LlmError(Exception):
    pass


def _complete(messages: list[dict[str, str]]):
    # Cerebras is sometimes briefly rate limited; wait and retry rather than fail the turn.
    for delay in (*RATE_LIMIT_RETRY_DELAYS, None):
        try:
            return completion(
                model=MODEL,
                messages=messages,
                response_format=AiTurn,
                reasoning_effort="low",
                max_tokens=MAX_TOKENS,
                extra_body=EXTRA_BODY,
            )
        except RateLimitError:
            if delay is None:
                raise
            time.sleep(delay)


def call_llm(messages: list[dict[str, str]]) -> AiTurn:
    try:
        response = _complete(messages)
        return AiTurn.model_validate_json(response.choices[0].message.content)
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
    fields: NdaFields
    today: date


class ChatResponse(CamelModel):
    reply: str
    fields: NdaFields


@router.post("", dependencies=[Depends(current_user)])
def chat(body: ChatRequest, llm: Annotated[Llm, Depends(get_llm)]) -> ChatResponse:
    if body.messages[-1].role != "user":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The last message must be from the user.")
    try:
        turn = llm(build_messages(body.messages, body.fields, body.today))
    except LlmError:
        logger.exception("Chat completion failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI assistant is unavailable right now. Please try again.")
    fields = apply_updates(body.fields, turn.updates)
    return ChatResponse(reply=turn.message_for(fields), fields=fields)
