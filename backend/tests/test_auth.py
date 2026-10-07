import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import COOKIE_NAME

from tests.conftest import SECRET


def test_sign_up_creates_the_user_and_signs_them_in(client: TestClient, sign_up):
    response = sign_up()

    assert response.status_code == 201
    assert response.json() == {"id": 1, "email": "ada@example.com"}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE_NAME}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=604800" in cookie
    assert "Secure" not in cookie
    assert client.get("/api/auth/me").json() == {"id": 1, "email": "ada@example.com"}


def test_sign_up_normalises_the_email(client: TestClient, sign_up):
    assert sign_up(email="  Ada@Example.COM ").json()["email"] == "ada@example.com"


def test_sign_up_stores_a_bcrypt_hash_not_the_password(client: TestClient, sign_up, settings):
    import sqlite3

    sign_up(password="correct horse")
    with sqlite3.connect(settings.database_path) as conn:
        (password_hash,) = conn.execute("SELECT password_hash FROM users").fetchone()
    assert password_hash.startswith("$2b$")
    assert "correct horse" not in password_hash


def test_sign_up_rejects_an_email_that_is_already_registered(client: TestClient, sign_up):
    sign_up()
    response = sign_up(email="ADA@example.com")
    assert response.status_code == 409
    assert response.json() == {"detail": "An account with this email already exists."}


@pytest.mark.parametrize("email", ["", "ada", "ada@example", "ada @example.com", "@example.com", "a" * 250 + "@x.com"])
def test_sign_up_rejects_invalid_emails(client: TestClient, sign_up, email):
    response = sign_up(email=email)
    assert response.status_code == 422
    assert response.json() == {"detail": "Enter a valid email address."}


@pytest.mark.parametrize(
    ("password", "message"),
    [
        ("short", "Password must be at least 8 characters."),
        ("x" * 73, "Password must be at most 72 bytes."),
        ("é" * 37, "Password must be at most 72 bytes."),  # 37 characters, 74 bytes
    ],
)
def test_sign_up_rejects_invalid_passwords(client: TestClient, sign_up, password, message):
    response = sign_up(password=password)
    assert response.status_code == 422
    assert response.json() == {"detail": message}


def test_sign_up_reports_missing_fields(client: TestClient):
    response = client.post("/api/auth/signup", json={"email": "ada@example.com"})
    assert response.status_code == 422
    assert response.json() == {"detail": "password: Field required"}


def test_sign_in_with_the_right_password(client: TestClient, sign_up):
    sign_up()
    client.cookies.clear()

    response = client.post("/api/auth/signin", json={"email": " ADA@example.com", "password": "correct horse"})

    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": "ada@example.com"}
    assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize(
    ("email", "password"),
    [("ada@example.com", "wrong horse"), ("nobody@example.com", "correct horse"), ("ada@example.com", "x" * 100), ("", "")],
)
def test_sign_in_with_wrong_credentials_gives_one_generic_error(client: TestClient, sign_up, email, password):
    sign_up()
    client.cookies.clear()

    response = client.post("/api/auth/signin", json={"email": email, "password": password})

    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password."}
    assert "set-cookie" not in response.headers
    assert client.get("/api/auth/me").status_code == 401


def test_sign_out_clears_the_session(client: TestClient, sign_up):
    sign_up()

    response = client.post("/api/auth/signout")

    assert response.status_code == 204
    assert 'prelegal_session=""' in response.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_a_session(client: TestClient):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not signed in."}


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"sub": "1", "exp": 4102444800}, "some-other-secret-that-is-32-bytes-long", algorithm="HS256"),  # forged
        jwt.encode({"sub": "1", "exp": 1}, SECRET, algorithm="HS256"),  # expired
        jwt.encode({"exp": 4102444800}, SECRET, algorithm="HS256"),  # no user
        jwt.encode({"sub": "abc", "exp": 4102444800}, SECRET, algorithm="HS256"),
        jwt.encode({"sub": "1", "exp": 4102444800}, None, algorithm="none"),  # unsigned
    ],
)
def test_me_rejects_bad_session_cookies(client: TestClient, sign_up, token):
    sign_up()
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_a_session_for_a_user_that_no_longer_exists(client: TestClient):
    # e.g. a cookie from before the container restarted and the database was recreated
    client.cookies.set(COOKIE_NAME, jwt.encode({"sub": "1", "exp": 4102444800}, SECRET, algorithm="HS256"))
    assert client.get("/api/auth/me").status_code == 401


def test_secure_cookies_can_be_turned_on(settings):
    from dataclasses import replace

    from app.main import create_app

    with TestClient(create_app(replace(settings, cookie_secure=True))) as client:
        response = client.post("/api/auth/signup", json={"email": "ada@example.com", "password": "correct horse"})
    assert "Secure" in response.headers["set-cookie"]
