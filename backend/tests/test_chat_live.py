"""Talks to the real model. Opt in with `uv run pytest -m live` (needs OPENROUTER_API_KEY in .env)."""

import os
from datetime import date

import pytest

from app.chat import ChatMessage, apply_updates, build_messages, call_llm
from app.config import load_settings
from tests.test_chat import fields

pytestmark = pytest.mark.live


@pytest.fixture(autouse=True)
def api_key():
    load_settings()  # loads .env
    if not os.environ.get("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is not set")


def test_fills_in_the_fields_from_a_free_form_answer():
    conversation = [
        ChatMessage(role="assistant", content="Hi! Which two companies is this NDA between?"),
        ChatMessage(
            role="user",
            content="Acme Inc. and Globex Corporation, to explore building a joint product. Delaware law, disputes in New Castle, DE. "
            "It starts next Monday and lasts 2 years; keep things confidential forever.",
        ),
    ]
    turn = call_llm(build_messages(conversation, fields(), date(2026, 10, 7)))  # a Wednesday
    result = apply_updates(fields(), turn.updates)

    assert turn.message_for(result)
    assert "acme" in result.party1.company.lower()
    assert "globex" in result.party2.company.lower()
    assert result.governing_law == "Delaware"
    assert "new castle" in result.jurisdiction.lower()
    assert result.effective_date == "2026-10-12"
    assert (result.mnda_term_type, result.mnda_term_years) == ("expires", 2)
    assert result.confidentiality_type == "perpetual"
    assert "joint product" in result.purpose.lower()


def test_asks_for_missing_information():
    conversation = [ChatMessage(role="user", content="I need an NDA.")]
    turn = call_llm(build_messages(conversation, fields(), date(2026, 10, 7)))
    assert "?" in turn.message_for(apply_updates(fields(), turn.updates))


def test_says_the_nda_is_ready_and_offers_the_optional_fields_once_complete():
    almost = fields(governingLaw="Delaware", jurisdiction="New Castle, DE", party1={"name": "", "title": "", "company": "Acme", "noticeAddress": ""})
    conversation = [
        ChatMessage(role="assistant", content="What's the other company's name?"),
        ChatMessage(role="user", content="Globex Corporation"),
    ]
    turn = call_llm(build_messages(conversation, almost, date(2026, 10, 7)))
    result = apply_updates(almost, turn.updates)
    assert "globex" in result.party2.company.lower()
    message = turn.message_for(result)
    assert "download" in message.lower()
    assert "?" in message
