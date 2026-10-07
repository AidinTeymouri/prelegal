# syntax=docker/dockerfile:1

# 1. Build the frontend as a static export (frontend/out).
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY templates/ /app/templates/
COPY frontend/ ./
RUN npm run build

# 2. Serve the API and the static frontend with FastAPI.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev
COPY backend/app ./app
COPY --from=frontend /app/frontend/out /app/static

# The database lives inside the container (no volume) and is recreated on every start.
RUN useradd --system app && mkdir /app/data && chown app /app/data
USER app
ENV PATH="/app/backend/.venv/bin:$PATH" STATIC_DIR=/app/static DATABASE_PATH=/app/data/prelegal.db
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
