"""Talks to the real model. Opt in with `uv run pytest -m live` (needs OPENROUTER_API_KEY in .env)."""

import os
import re

import pytest

from app.chat import ChatMessage, build_messages, call_llm, turn_model
from app.config import load_settings
from app.documents import DOCUMENTS, Party, apply_updates, default_data
from tests.test_chat import NDA, TODAY, nda

pytestmark = pytest.mark.live


@pytest.fixture(autouse=True)
def api_key():
    load_settings()  # loads .env
    if not os.environ.get("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is not set")


def ask(conversation, spec=None, data=None):
    return call_llm(build_messages(conversation, spec, data, TODAY), turn_model(spec))


def test_fills_in_the_nda_from_a_free_form_answer():
    conversation = [
        ChatMessage(role="assistant", content="Hi! Which two companies is this NDA between?"),
        ChatMessage(
            role="user",
            content="Acme Inc. and Globex Corporation, to explore building a joint product. Delaware law, disputes in New Castle, DE. "
            "It starts next Monday and lasts 2 years; keep things confidential forever.",
        ),
    ]
    turn = ask(conversation, NDA, nda())
    result = apply_updates(NDA, nda(), turn.updates)

    assert turn.message_for(NDA, result)
    assert "acme" in result.parties[0].company.lower()
    assert "globex" in result.parties[1].company.lower()
    assert result.values["governingLaw"] == "Delaware"
    assert "new castle" in str(result.values["chosenCourts"]).lower()
    assert result.values["effectiveDate"] == "2026-10-12"
    assert (result.values["mndaTermType"], result.values["mndaTermYears"]) == ("expires", 2)
    assert result.values["confidentialityType"] == "perpetual"
    assert "joint product" in str(result.values["purpose"]).lower()


def test_asks_for_missing_information():
    turn = ask([ChatMessage(role="user", content="I need an NDA.")], NDA, nda())
    assert "?" in turn.message_for(NDA, apply_updates(NDA, nda(), turn.updates))


def test_says_the_nda_is_ready_and_offers_the_optional_fields_once_complete():
    almost = nda(governingLaw="Delaware", chosenCourts="New Castle, DE", parties=(Party(company="Acme"), Party()))
    conversation = [
        ChatMessage(role="assistant", content="What's the other company's name?"),
        ChatMessage(role="user", content="Globex Corporation"),
    ]
    turn = ask(conversation, NDA, almost)
    result = apply_updates(NDA, almost, turn.updates)
    assert "globex" in result.parties[1].company.lower()
    message = turn.message_for(NDA, result)
    assert "download" in message.lower()
    assert "?" in message


def test_suggests_a_document_for_what_the_user_describes():
    conversation = [ChatMessage(role="user", content="We're letting a customer try our analytics product for 90 days before they buy it.")]
    turn = ask(conversation)
    assert turn.document in (None, "pilot-agreement")
    assert "pilot" in turn.reply.lower()


def test_chooses_the_document_once_the_user_confirms():
    conversation = [
        ChatMessage(role="user", content="We're letting a customer try our analytics product for 90 days before they buy it."),
        ChatMessage(role="assistant", content="That sounds like a Pilot Agreement. Would you like me to draft one?"),
        ChatMessage(role="user", content="Yes please."),
    ]
    assert ask(conversation).document == "pilot-agreement"


def test_offers_the_closest_document_when_asked_for_one_it_cannot_draft():
    turn = ask([ChatMessage(role="user", content="Can you write an employment contract for my new hire?")])
    assert turn.document is None
    # Letters only: the model sometimes writes names with no-break spaces or hyphens.
    letters = lambda text: re.sub(r"[^a-z]", "", text.lower())  # noqa: E731
    assert "employment" in letters(turn.reply)
    assert any(letters(spec.name) in letters(turn.reply) for spec in DOCUMENTS.values())


def test_fills_in_the_largest_document():
    spec = DOCUMENTS["professional-services-agreement"]
    data = default_data(spec, TODAY)
    conversation = [
        ChatMessage(
            role="user",
            content="Acme Consulting is the provider and Globex the customer. Acme will migrate Globex's database for $20,000 fixed, "
            "delivering a migration plan and the migrated database. Delaware law, courts in New Castle, DE, starting next Monday.",
        )
    ]
    turn = ask(conversation, spec, data)
    result = apply_updates(spec, data, turn.updates)
    assert "acme" in result.parties[0].company.lower()
    assert "globex" in result.parties[1].company.lower()
    assert "20,000" in str(result.values["fees"])
    assert result.values["effectiveDate"] == "2026-10-12"
    assert result.values["governingLaw"] == "Delaware"
