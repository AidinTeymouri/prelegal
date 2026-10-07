from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

SECRET = "test-secret-at-least-32-bytes-long"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    static_dir = tmp_path / "out"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<!doctype html><title>Prelegal</title>")
    (static_dir / "404.html").write_text("<!doctype html><title>Not found</title>")
    return Settings(database_path=tmp_path / "data" / "prelegal.db", static_dir=static_dir, session_secret=SECRET)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    # The context manager runs the app's startup, which creates the database.
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def sign_up(client: TestClient) -> Callable[..., object]:
    def sign_up(email: str = "ada@example.com", password: str = "correct horse"):
        return client.post("/api/auth/signup", json={"email": email, "password": password})

    return sign_up
