"""The Prelegal app: the JSON API under /api, and the statically exported frontend everywhere else."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import auth, chat, drafts
from app.config import Settings, load_settings
from app.db import reset_database

logger = logging.getLogger(__name__)


async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Reply with one readable message, like the other API errors, instead of FastAPI's error list.
    error = exc.errors()[0]
    if error["type"] == "value_error":  # raised by our own validators, already worded for the user
        message = str(error["ctx"]["error"])
    else:
        message = f"{error['loc'][-1]}: {error['msg']}"
    return JSONResponse({"detail": message}, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        reset_database(settings.database_path)
        yield

    app = FastAPI(title="Prelegal", lifespan=lifespan)
    app.state.settings = settings
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(drafts.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # Unknown API paths get a JSON 404 rather than the frontend's 404 page.
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def api_not_found(path: str) -> None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    else:
        logger.warning("No frontend build at %s; only the API is served. Run `npm run build` in frontend/.", settings.static_dir)

    return app


app = create_app()
