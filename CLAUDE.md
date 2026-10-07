# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports the Mutual NDA only: an AI chat (or a Fields tab) fills it in, with live preview and PDF download, behind email/password sign in. The other document types are not built yet.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.
There is a CEREBARS_API_KEY (spelled that way) in the .env file in the project root.
The .env file also has an optional SESSION_SECRET (currently blank; the backend then uses a random secret per run).

## Technical design

The entire project is packaged into a single Docker container (multi-stage `Dockerfile` in the root).  
The backend is in backend/ and is a uv project, using FastAPI.  
The frontend is in frontend/ (Next.js, built as a static export and served by FastAPI).  
The database is SQLite, recreated from scratch each time the app starts, with a users table for sign up and sign in.  
Scripts in scripts/ (the Mac and Linux ones wrap `scripts/start.sh` / `scripts/stop.sh`):

```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

App and API available at http://localhost:8000

## Color Scheme

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implementation Status

### Completed (PREL-3)

- Mutual NDA creator prototype (Next.js): form, live preview, PDF download

### Completed (PREL-4)

- Docker multi-stage build (Node builds the static frontend, Python + uv serves it)
- FastAPI backend in backend/ (uv project) with SQLite, recreated empty on every start
- Next.js static export served by FastAPI at localhost:8000; `next dev` forwards /api to the backend
- Users table; sign up / sign in / sign out with bcrypt passwords and a JWT in an HttpOnly cookie
- Sign-in screen in front of the Mutual NDA creator, with sign out in the header
- Start/stop scripts for Mac, Linux, Windows
- Tests: pytest (backend), Vitest (frontend), Playwright e2e against the backend serving the export

### Completed (PREL-5)

- AI chat (default "Chat" tab) fills in the Mutual NDA; the form stays available on a "Fields" tab
- `POST /api/chat`: stateless (client sends the conversation + current fields), LiteLLM → OpenRouter → Cerebras `gpt-oss-120b`, Structured Outputs
- Model returns field updates (null = unchanged), validated and merged server-side; it writes both a "missing info" question and a "ready to download" message and the server picks the one that fits
- Cerebras only (`allow_fallbacks: false`), `max_tokens` 2000, retries on 429 rate limits; the prompt lists the coming weeks' dates because the model is bad at date arithmetic
- Live model tests: `cd backend && uv run pytest -m live`

### Current API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/signup` - Create new user account and sign in
- `POST /api/auth/signin` - Sign in and receive JWT cookie
- `POST /api/auth/signout` - Clear auth cookie
- `GET /api/auth/me` - Get current user info (401 if not signed in)
- `POST /api/chat` - AI chat turn for the Mutual NDA (auth required): `{messages, fields, today}` → `{reply, fields}`

### Implementation notes

- Backend: `app/main.py` (app factory, recreates the DB on startup, serves `frontend/out`), `app/auth.py` (endpoints and the `current_user` dependency for protected routes), `app/db.py` (schema, `get_db`), `app/config.py` (env vars: `DATABASE_PATH`, `STATIC_DIR`, `SESSION_SECRET`, `COOKIE_SECURE`). API errors are `{"detail": "<message>"}`.
- SQLite connections use `check_same_thread=False`: FastAPI runs a sync dependency and its endpoint on different threads.
- Frontend: `src/components/App.tsx` gates the app on `/api/auth/me` and shows `AuthForm.tsx` or the NDA creator; `src/lib/api.ts` is the API client. Templates are read at build time from the repo-root `templates/`. Brand colours are Tailwind tokens (`bg-brand-purple`, `text-brand-navy`, ...) in `globals.css`.
- Next.js 16 is newer than training data: read `frontend/node_modules/next/dist/docs/` before changing Next.js code.
- Local dev: `cd backend && uv run uvicorn app.main:app --reload`, plus `cd frontend && npm run dev` (port 3000, forwards `/api` to 8000).
- Tests: `cd backend && uv run pytest` (`-m live` for the real model); in frontend/, `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` (builds the export, serves it with the backend on port 3100, and each test signs up its own user). Manual checklist: `frontend/MANUAL_TESTING.md`.
- The Windows scripts have not been run yet (no PowerShell on the dev machine).
