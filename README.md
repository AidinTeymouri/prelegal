# prelegal
A platform for drafting common legal agreements

> **Status: In progress** — This project is under active development and is expected to be completed by **October 8, 2026** (one week from October 1, 2026).

## Running it

Prelegal runs as a single Docker container at <http://localhost:8000>. You need [Docker](https://www.docker.com/) running, and a `.env` file in the project root with the API keys (`OPENROUTER_API_KEY`; optionally `SESSION_SECRET`).

| | Start | Stop |
| --- | --- | --- |
| macOS | `scripts/start-mac.sh` | `scripts/stop-mac.sh` |
| Linux | `scripts/start-linux.sh` | `scripts/stop-linux.sh` |
| Windows (PowerShell) | `scripts/start-windows.ps1` | `scripts/stop-windows.ps1` |

Starting rebuilds the image and replaces any running container. The SQLite database lives inside the container and starts empty every time, so accounts don't survive a restart.

## Layout

- `frontend/` – Next.js app, built as a static export and served by the backend. See [frontend/README.md](frontend/README.md).
- `backend/` – FastAPI app (a [uv](https://docs.astral.sh/uv/) project): the JSON API under `/api` and the frontend everywhere else. See [backend/README.md](backend/README.md).
- `templates/` – the Common Paper agreement templates (CC BY 4.0), listed in `catalog.json`.
- `scripts/` – start and stop scripts.
- `Dockerfile` – builds the frontend with Node, then serves it from a Python image.

## Development

Run the backend and the frontend dev server side by side; `next dev` forwards `/api` to the backend.

```bash
cd backend && uv run uvicorn app.main:app --reload   # http://localhost:8000 (API)
cd frontend && npm install && npm run dev            # http://localhost:3000 (app)
```
