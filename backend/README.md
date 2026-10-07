# Prelegal backend

FastAPI app that serves the JSON API under `/api` and the statically exported frontend (`frontend/out`) everywhere else.

```bash
uv run uvicorn app.main:app --reload   # http://localhost:8000
uv run pytest                          # tests
```

Without a frontend build only the API is served; run `npm run build` in `frontend/` first, or use the Next.js dev server (see the root README).

## Settings

Read from environment variables (the Docker container gets them from the root `.env`):

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_PATH` | `backend/data/prelegal.db` | SQLite file. Deleted and recreated empty on every start. |
| `STATIC_DIR` | `frontend/out` | The frontend build to serve. |
| `SESSION_SECRET` | random per process | Signs session tokens. |
| `COOKIE_SECURE` | off | Set to `true` to send the session cookie over HTTPS only. |

## API

| Endpoint | |
| --- | --- |
| `GET /api/health` | `{"status": "ok"}` |
| `POST /api/auth/signup` | `{email, password}` → 201 with `{id, email}`, and signs the user in. 409 if the email is taken, 422 if invalid (password at least 8 characters). |
| `POST /api/auth/signin` | `{email, password}` → `{id, email}`, and signs the user in. 401 if wrong. |
| `POST /api/auth/signout` | 204; clears the session. |
| `GET /api/auth/me` | The signed-in user, or 401. |

Errors are JSON `{"detail": "<message for the user>"}`. Sessions are a JWT (HS256, 7 days) in the HttpOnly `prelegal_session` cookie; passwords are hashed with bcrypt. Endpoints that need a signed-in user can depend on `app.auth.current_user`.

- `app/main.py` – creates the app: startup (recreates the database), routes and the static frontend.
- `app/auth.py` – the auth endpoints and the `current_user` dependency.
- `app/db.py` – the schema and a per-request connection (`get_db`).
- `app/config.py` – settings.
