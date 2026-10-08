# Prelegal backend

FastAPI app that serves the JSON API under `/api` and the statically exported frontend (`frontend/out`) everywhere else.

```bash
uv run uvicorn app.main:app --reload   # http://localhost:8000
uv run pytest                          # tests (the AI model is faked)
uv run pytest -m live                  # also talks to the real model (needs OPENROUTER_API_KEY)
```

Without a frontend build only the API is served; run `npm run build` in `frontend/` first, or use the Next.js dev server (see the root README).

## Settings

Read from environment variables. Locally they are loaded from the root `.env`; the Docker container gets them with `--env-file .env`.

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_PATH` | `backend/data/prelegal.db` | SQLite file. Deleted and recreated empty on every start. |
| `STATIC_DIR` | `frontend/out` | The frontend build to serve. |
| `SESSION_SECRET` | random per process | Signs session tokens. |
| `COOKIE_SECURE` | off | Set to `true` to send the session cookie over HTTPS only. |
| `OPENROUTER_API_KEY` | none | For the AI chat. Without it, `/api/chat` returns 503. |

## API

| Endpoint | |
| --- | --- |
| `GET /api/health` | `{"status": "ok"}` |
| `POST /api/auth/signup` | `{email, password}` → 201 with `{id, email}`, and signs the user in. 409 if the email is taken, 422 if invalid (password at least 8 characters). |
| `POST /api/auth/signin` | `{email, password}` → `{id, email}`, and signs the user in. 401 if wrong. |
| `POST /api/auth/signout` | 204; clears the session. |
| `GET /api/auth/me` | The signed-in user, or 401. |
| `GET /api/documents` | Signed in. The user's saved documents, newest first: `[{id, document, title, ready, updatedAt}]`. |
| `GET /api/documents/{id}` | Signed in. One saved document, with `fields` and `messages`. 404 if it doesn't exist or belongs to someone else. |
| `PUT /api/documents/{id}` | Signed in. Creates or replaces a saved document: `{document, fields, messages}`, where `id` is a UUID chosen by the browser. The fields are checked against the document's spec (422 if invalid); the title and `ready` (no required field missing) are worked out on the server. 404 if the id is someone else's. |
| `DELETE /api/documents/{id}` | Signed in. 204, or 404. |
| `POST /api/chat` | Signed in. `{messages: [{role, content}], document, fields, today}` → `{reply, document, fields}`: the assistant's reply, the document being drafted (a `templates/documents.json` id, or null until one is chosen) and its fields `{values, parties}` with the assistant's changes applied. 422 for an unknown document or invalid field, 502 if the model fails, 503 without an API key. |

Errors are JSON `{"detail": "<message for the user>"}`. Sessions are a JWT (HS256, 7 days) in the HttpOnly `prelegal_session` cookie; passwords are hashed with bcrypt. Endpoints that need a signed-in user can depend on `app.auth.current_user`.

- `app/main.py` – creates the app: startup (recreates the database), routes and the static frontend.
- `app/auth.py` – the auth endpoints and the `current_user` dependency.
- `app/documents.py` – the documents Prelegal can draft, read from `templates/documents.json` (shared with the frontend): field data, defaults, validation, required and optional fields, carrying values over to another document, and each document's Structured Output schema for field updates.
- `app/chat.py` – the AI chat. It is stateless: the client sends the whole conversation, the chosen document and its fields each time. The model (`gpt-oss-120b` on Cerebras via OpenRouter and LiteLLM) knows every document it can draft. Before a document is chosen it helps the user pick one (offering the closest one when asked for a document it can't draft) and returns its id. When it chooses or switches document, the server carries the shared fields over and asks the model again with the new document's schema. Otherwise it returns its reply, field updates (null = unchanged) and two endings: a question about missing required fields and a "ready to download" message. The server validates and merges the updates, then picks the ending that fits the updated fields. Requests stay on Cerebras (no fallback providers) and are retried when it is briefly rate limited.
- `app/drafts.py` – users' saved documents (autosaved drafts, including the chat). Every query is scoped to the signed-in user.
- `app/db.py` – the schema (users and drafts) and a per-request connection (`get_db`). Endpoints use it through `app.auth.Db`, which commits before the response is sent.
- `app/config.py` – settings.
