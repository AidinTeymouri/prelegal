"""SQLite storage. The database is temporary: it is recreated empty every time the app starts."""

import sqlite3
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path

from fastapi import Request

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Each user's documents, saved automatically while they work (see app/drafts.py).
CREATE TABLE drafts (
    id TEXT PRIMARY KEY,  -- a UUID chosen by the browser
    user_id INTEGER NOT NULL REFERENCES users (id),
    document TEXT,  -- a templates/documents.json id, or NULL before one is chosen
    title TEXT NOT NULL,
    ready INTEGER NOT NULL,  -- 1 when no required field is missing
    fields TEXT,  -- DocumentData JSON
    messages TEXT NOT NULL,  -- the chat conversation, JSON
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX drafts_by_user ON drafts (user_id, updated_at DESC);
"""


def reset_database(path: Path) -> None:
    """Delete the database file, if any, and create the schema in a new one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(SCHEMA)


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: a connection for the current request, committed if the request succeeds."""
    # FastAPI may open, use and close the connection on different threadpool threads,
    # but only ever one at a time, so sharing it across threads is safe.
    conn = sqlite3.connect(request.app.state.settings.database_path, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()
