import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_serves_the_frontend(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert "<title>Prelegal</title>" in response.text


def test_unknown_pages_get_the_frontend_404_page(client: TestClient):
    response = client.get("/no-such-page")
    assert response.status_code == 404
    assert "<title>Not found</title>" in response.text


def test_unknown_api_paths_get_a_json_404(client: TestClient):
    for method in ("get", "post", "delete"):
        response = client.request(method, "/api/no-such-thing")
        assert response.status_code == 404
        assert response.json() == {"detail": "Not found."}


def test_runs_without_a_frontend_build(settings, tmp_path):
    with TestClient(create_app(replace(settings, static_dir=tmp_path / "missing"))) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404


def test_the_database_starts_empty_on_every_start(settings):
    with TestClient(create_app(settings)) as client:
        client.post("/api/auth/signup", json={"email": "ada@example.com", "password": "correct horse"})
        assert client.post("/api/auth/signin", json={"email": "ada@example.com", "password": "correct horse"}).status_code == 200

    with TestClient(create_app(settings)) as client:
        assert client.post("/api/auth/signin", json={"email": "ada@example.com", "password": "correct horse"}).status_code == 401
        # The email can be registered again.
        assert client.post("/api/auth/signup", json={"email": "ada@example.com", "password": "correct horse"}).status_code == 201


def test_the_database_has_a_users_table(client: TestClient, settings):
    with sqlite3.connect(settings.database_path) as conn:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)")]
    assert columns == ["id", "email", "password_hash", "created_at"]


def test_handles_concurrent_requests(client: TestClient):
    # Regression: connections were used across threadpool threads, giving 500s under load.
    def sign_up(n: int) -> int:
        return client.post("/api/auth/signup", json={"email": f"user{n}@example.com", "password": "correct horse"}).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        assert list(pool.map(sign_up, range(20))) == [201] * 20
        assert list(pool.map(sign_up, range(20))) == [409] * 20
