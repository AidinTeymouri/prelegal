"""Settings, read from environment variables (the Docker container gets them from .env)."""

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_path: Path
    # The statically exported frontend (`next build` writes it to frontend/out).
    static_dir: Path
    session_secret: str
    # Send the session cookie over HTTPS only. Off by default: the app runs on http://localhost.
    cookie_secure: bool = False


def load_settings() -> Settings:
    # For local runs; the Docker container gets the same variables with --env-file.
    load_dotenv(REPO_ROOT / ".env")
    return Settings(
        database_path=Path(os.environ.get("DATABASE_PATH", REPO_ROOT / "backend" / "data" / "prelegal.db")),
        static_dir=Path(os.environ.get("STATIC_DIR", REPO_ROOT / "frontend" / "out")),
        # A random secret is fine when none is set: the users table is recreated on every
        # start, so sessions can't outlive the process anyway.
        session_secret=os.environ.get("SESSION_SECRET") or secrets.token_urlsafe(32),
        cookie_secure=os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes"),
    )
