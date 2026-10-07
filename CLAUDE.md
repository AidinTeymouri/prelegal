# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation is the V1 technical foundation: a Mutual NDA form with live preview and PDF download, behind email/password sign in. AI chat and the other document types are not built yet.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.
There is an CEREBAS_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
There should be scripts in scripts/ for:

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

Backend available at http://localhost:8000

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

### Current API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/signup` - Create new user account and sign in
- `POST /api/auth/signin` - Sign in and receive JWT cookie
- `POST /api/auth/signout` - Clear auth cookie
- `GET /api/auth/me` - Get current user info (401 if not signed in)
