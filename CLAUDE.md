# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports every document in the catalog (the NDA cover page is part of the Mutual NDA, so there are 11 documents): an AI chat works out which document the user needs (offering the closest one for anything unsupported) and fills it in, or the user picks one and uses the Fields tab, with live preview and PDF download, behind email/password sign in. The documents and their cover page fields are defined in `templates/documents.json`.

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

### Completed (PREL-6)

- All 11 catalog documents (Mutual NDA + AI Addendum, BAA, CSA, DPA, Design Partner, Partnership, Pilot, PSA, SLA, Software License)
- `templates/documents.json` is the single spec read by backend and frontend: per document its party roles and cover page fields (label, type text/longtext/date/enum/int, required, default, description for the AI). Shared keys (`effectiveDate`, `governingLaw`, `chosenCourts`, ...) carry over when switching documents
- The 10 templates without a cover page get a generated one ("Label: value", blank optional = "None"); the Mutual NDA keeps its own wording (`buildNdaCoverPage` in `frontend/src/lib/cover.ts`)
- Standard terms parser handles nested numbered clauses (1, 1.1, (a)) and every `*_link` span
- Chat starts with no document: the model picks one (`document` in its Structured Output) once the user confirms; on a switch the server carries shared fields over and asks the model again with the new document's schema. A document picker above the tabs also switches by hand

### Current API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/signup` - Create new user account and sign in
- `POST /api/auth/signin` - Sign in and receive JWT cookie
- `POST /api/auth/signout` - Clear auth cookie
- `GET /api/auth/me` - Get current user info (401 if not signed in)
- `POST /api/chat` - AI chat turn (auth required): `{messages, document, fields, today}` → `{reply, document, fields}`; `document` is a `templates/documents.json` id or null, `fields` is `{values, parties}`

### Implementation notes

- Backend: `app/main.py` (app factory, recreates the DB on startup, serves `frontend/out`), `app/auth.py` (endpoints and the `current_user` dependency for protected routes), `app/documents.py` (loads `templates/documents.json`; validation, merge, carry-over, per-document update schemas), `app/chat.py` (`POST /api/chat`: prompt, response schema, LLM call), `app/db.py` (schema, `get_db`), `app/config.py` (loads the root `.env` for local runs; env vars: `DATABASE_PATH`, `STATIC_DIR`, `SESSION_SECRET`, `COOKIE_SECURE`; `chat.py` reads `OPENROUTER_API_KEY` and returns 503 without it). API errors are `{"detail": "<message>"}`.
- SQLite connections use `check_same_thread=False`: FastAPI runs a sync dependency and its endpoint on different threads.
- Frontend: `src/components/App.tsx` gates the app on `/api/auth/me` and shows `AuthForm.tsx` or the document creator (`DocumentBuilder.tsx`: document picker and Chat/Fields tabs beside the preview; `DocumentChat.tsx` with `src/lib/useDocumentChat.ts`, which applies only the fields the AI changed so Fields-tab edits made mid-reply are kept); `src/lib/api.ts` is the API client. `src/lib/documents.ts` (spec types, defaults, required fields, carry-over), `terms.ts`/`inline.ts` (standard terms parser), `cover.ts` (cover pages). `documents.json` and the templates are read at build time from the repo-root `templates/`; the Docker backend stage copies `templates/documents.json` too. Brand colours are Tailwind tokens (`bg-brand-purple`, `text-brand-navy`, ...) in `globals.css`.
- Next.js 16 is newer than training data: read `frontend/node_modules/next/dist/docs/` before changing Next.js code.
- Local dev: `cd backend && uv run uvicorn app.main:app --reload`, plus `cd frontend && npm run dev` (port 3000, forwards `/api` to 8000).
- Tests: `cd backend && uv run pytest` (`-m live` for the real model); in frontend/, `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` (builds the export, serves it with the backend on port 3100, and each test signs up its own user). Manual checklist: `frontend/MANUAL_TESTING.md`.
- The Windows scripts have not been run yet (no PowerShell on the dev machine).
