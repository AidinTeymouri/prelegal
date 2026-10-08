import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.documents import DOCUMENTS, default_data
from tests.test_chat import TODAY

EMPTY_PARTY = {"name": "", "title": "", "company": "", "noticeAddress": ""}
GREETING = {"role": "assistant", "content": "Hi! What would you like to create?"}


def nda_fields(governing_law: str = "", companies: tuple[str, str] = ("", "")) -> dict:
    values = {**default_data(DOCUMENTS["mutual-nda"], TODAY).values, "governingLaw": governing_law}
    return {"values": values, "parties": [{**EMPTY_PARTY, "company": c} for c in companies]}


def nda_draft(**changes) -> dict:
    return {"document": "mutual-nda", "fields": nda_fields(), "messages": [GREETING], **changes}


@pytest.fixture
def signed_in(client: TestClient, sign_up) -> TestClient:
    sign_up()
    return client


def save(client: TestClient, draft_id: str, body: dict):
    return client.put(f"/api/documents/{draft_id}", json=body)


def test_saves_and_reopens_a_document_with_its_conversation(signed_in: TestClient):
    draft_id = str(uuid4())
    messages = [GREETING, {"role": "user", "content": "An NDA please"}, {"role": "assistant", "content": "Which companies?"}]
    fields = nda_fields("Delaware", ("Acme Inc.", ""))

    saved = save(signed_in, draft_id, nda_draft(fields=fields, messages=messages))

    assert saved.status_code == 200
    body = signed_in.get(f"/api/documents/{draft_id}").json()
    assert body == saved.json()
    assert body["id"] == draft_id
    assert body["document"] == "mutual-nda"
    assert body["title"] == "Mutual Non-Disclosure Agreement: Acme Inc."
    assert body["ready"] is False
    assert body["fields"] == fields
    assert body["messages"] == messages
    assert body["createdAt"].endswith("Z") and body["updatedAt"] >= body["createdAt"]


def test_saving_again_replaces_the_document(signed_in: TestClient):
    draft_id = str(uuid4())
    first = save(signed_in, draft_id, nda_draft()).json()
    second = save(signed_in, draft_id, nda_draft(fields=nda_fields("Delaware"))).json()

    assert second["fields"]["values"]["governingLaw"] == "Delaware"
    assert second["createdAt"] == first["createdAt"]
    assert second["updatedAt"] > first["updatedAt"]
    assert len(signed_in.get("/api/documents").json()) == 1


def test_saves_a_conversation_before_a_document_is_chosen(signed_in: TestClient):
    draft_id = str(uuid4())
    body = save(signed_in, draft_id, {"document": None, "fields": None, "messages": [GREETING, {"role": "user", "content": "Hi"}]}).json()
    assert (body["document"], body["fields"], body["title"], body["ready"]) == (None, None, "Untitled document", False)


def test_marks_a_document_ready_once_nothing_required_is_missing(signed_in: TestClient):
    fields = nda_fields("Delaware", ("Acme", "Globex"))
    fields["values"]["chosenCourts"] = "New Castle, DE"
    body = save(signed_in, str(uuid4()), nda_draft(fields=fields)).json()
    assert body["ready"] is True
    assert body["title"] == "Mutual Non-Disclosure Agreement: Acme / Globex"


def test_fills_in_missing_values_from_the_spec(signed_in: TestClient):
    body = save(signed_in, str(uuid4()), nda_draft(fields={"values": {}, "parties": [EMPTY_PARTY, EMPTY_PARTY]})).json()
    assert body["fields"]["values"]["mndaTermYears"] == 1


def test_lists_the_users_documents_most_recently_updated_first(signed_in: TestClient):
    ids = [str(uuid4()) for _ in range(3)]
    for draft_id in ids:
        save(signed_in, draft_id, nda_draft())
    save(signed_in, ids[0], nda_draft(fields=nda_fields("Delaware")))

    listed = signed_in.get("/api/documents").json()

    assert [d["id"] for d in listed] == [ids[0], ids[2], ids[1]]
    assert set(listed[0]) == {"id", "document", "title", "ready", "updatedAt"}


def test_deletes_a_document(signed_in: TestClient):
    draft_id = str(uuid4())
    save(signed_in, draft_id, nda_draft())

    assert signed_in.delete(f"/api/documents/{draft_id}").status_code == 204
    assert signed_in.get(f"/api/documents/{draft_id}").status_code == 404
    assert signed_in.get("/api/documents").json() == []
    assert signed_in.delete(f"/api/documents/{draft_id}").status_code == 404


def test_keeps_each_users_documents_private(client: TestClient, sign_up, settings):
    sign_up("ada@example.com")
    draft_id = str(uuid4())
    save(client, draft_id, nda_draft(fields=nda_fields("Delaware")))

    client.cookies.clear()
    sign_up("bob@example.com")
    not_found = {"detail": "Document not found."}
    assert client.get("/api/documents").json() == []
    assert client.get(f"/api/documents/{draft_id}").json() == not_found
    response = save(client, draft_id, nda_draft(fields=nda_fields("New York")))
    assert (response.status_code, response.json()) == (404, not_found)
    assert client.delete(f"/api/documents/{draft_id}").status_code == 404

    # Ada's document is untouched.
    with sqlite3.connect(settings.database_path) as conn:
        assert conn.execute("SELECT user_id, fields LIKE '%Delaware%' FROM drafts").fetchall() == [(1, 1)]


def test_requires_sign_in(client: TestClient):
    draft_id = str(uuid4())
    for response in (
        client.get("/api/documents"),
        client.get(f"/api/documents/{draft_id}"),
        save(client, draft_id, nda_draft()),
        client.delete(f"/api/documents/{draft_id}"),
    ):
        assert (response.status_code, response.json()) == (401, {"detail": "Not signed in."})


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"document": "employment-contract"}, "Unknown document: employment-contract."),
        ({"document": None}, "Choose a document before filling in fields."),
        ({"fields": {"values": {"salary": "1"}, "parties": [EMPTY_PARTY, EMPTY_PARTY]}}, "Unknown field for the Mutual Non-Disclosure Agreement: salary."),
        ({"fields": {"values": {"mndaTermYears": 0}, "parties": [EMPTY_PARTY, EMPTY_PARTY]}}, "MNDA term in years must be a whole number from 1 to 99."),
        ({"messages": [{"role": "system", "content": "hi"}]}, "Input should be 'user' or 'assistant'"),
        ({"messages": [GREETING] * 102}, "List should have at most 101 items"),
    ],
)
def test_rejects_invalid_documents(signed_in: TestClient, changes, detail):
    response = save(signed_in, str(uuid4()), nda_draft(**changes))
    assert response.status_code == 422
    assert detail in response.json()["detail"]


def test_saves_the_longest_conversation_the_chat_allows_plus_its_reply(signed_in: TestClient):
    messages = [GREETING, *[{"role": "user", "content": "Hi"}] * 99, {"role": "assistant", "content": "Hello"}]
    assert save(signed_in, str(uuid4()), nda_draft(messages=messages)).status_code == 200


def test_rejects_ids_that_are_not_uuids(signed_in: TestClient):
    assert signed_in.get("/api/documents/42").status_code == 422
