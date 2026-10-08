"""Each user's documents, saved automatically as they work, so they can come back to them.

The browser picks a UUID for a new document and saves it with PUT, which creates or
replaces it. The server checks the fields against the document's spec and works out
the title and whether the document is ready to download.
"""

import json
import sqlite3
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field

from app.auth import Db, User, current_user
from app.chat import MAX_MESSAGES, ChatMessage
from app.documents import DOCUMENTS, CamelModel, DocumentData, missing_required_fields, validate_data

router = APIRouter(prefix="/api/documents", tags=["documents"])

CurrentUser = Annotated[User, Depends(current_user)]
UNTITLED = "Untitled document"


class DraftIn(CamelModel):
    document: str | None = None
    fields: DocumentData | None = None
    # The chat accepts up to MAX_MESSAGES, and its reply makes one more.
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES + 1)


class DraftSummary(CamelModel):
    id: UUID
    document: str | None
    title: str
    ready: bool
    updated_at: str


class Draft(DraftSummary):
    fields: DocumentData | None
    messages: list[ChatMessage]
    created_at: str


def _title(document: str | None, fields: DocumentData | None) -> str:
    """e.g. "Mutual Non-Disclosure Agreement: Acme Inc. / Globex"."""
    if document is None:
        return UNTITLED
    companies = " / ".join(p.company for p in fields.parties if p.company.strip()) if fields else ""
    return f"{DOCUMENTS[document].name}: {companies}" if companies else DOCUMENTS[document].name


def _checked(body: DraftIn) -> tuple[DocumentData | None, bool]:
    """The fields validated against the document's spec, and whether the document is ready."""
    if body.document is None:
        if body.fields is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a document before filling in fields.")
        return None, False
    if body.document not in DOCUMENTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown document: {body.document}.")
    spec = DOCUMENTS[body.document]
    try:
        fields = validate_data(spec, body.fields, date.today())
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
    return fields, not missing_required_fields(spec, fields)


def _row_to_draft(row: sqlite3.Row) -> Draft:
    return Draft(
        id=row["id"],
        document=row["document"],
        title=row["title"],
        ready=bool(row["ready"]),
        fields=DocumentData.model_validate_json(row["fields"]) if row["fields"] else None,
        messages=json.loads(row["messages"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _not_found() -> HTTPException:
    # Also for other users' documents, so ids don't reveal anything.
    return HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")


@router.get("")
def list_drafts(user: CurrentUser, db: Db) -> list[DraftSummary]:
    rows = db.execute(
        "SELECT id, document, title, ready, updated_at FROM drafts WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC",
        (user.id,),
    ).fetchall()
    return [DraftSummary(id=r["id"], document=r["document"], title=r["title"], ready=bool(r["ready"]), updated_at=r["updated_at"]) for r in rows]


@router.get("/{draft_id}")
def get_draft(draft_id: UUID, user: CurrentUser, db: Db) -> Draft:
    row = db.execute("SELECT * FROM drafts WHERE id = ? AND user_id = ?", (str(draft_id), user.id)).fetchone()
    if row is None:
        raise _not_found()
    return _row_to_draft(row)


@router.put("/{draft_id}")
def save_draft(draft_id: UUID, body: DraftIn, user: CurrentUser, db: Db) -> Draft:
    fields, ready = _checked(body)
    values = (
        str(draft_id),
        user.id,
        body.document,
        _title(body.document, fields),
        int(ready),
        fields.model_dump_json(by_alias=True) if fields else None,
        json.dumps([m.model_dump() for m in body.messages]),
    )
    # Creates the document, or replaces it if it's the user's own; another user's id matches no row.
    cursor = db.execute(
        """
        INSERT INTO drafts (id, user_id, document, title, ready, fields, messages) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            document = excluded.document, title = excluded.title, ready = excluded.ready, fields = excluded.fields,
            messages = excluded.messages, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE drafts.user_id = excluded.user_id
        """,
        values,
    )
    if cursor.rowcount == 0:
        raise _not_found()
    return get_draft(draft_id, user, db)


@router.delete("/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(draft_id: UUID, user: CurrentUser, db: Db) -> None:
    if db.execute("DELETE FROM drafts WHERE id = ? AND user_id = ?", (str(draft_id), user.id)).rowcount == 0:
        raise _not_found()
