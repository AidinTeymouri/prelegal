"""Sign up, sign in and sign out with email and password.

Passwords are hashed with bcrypt. A signed-in user gets a JWT in an HttpOnly cookie.
"""

import re
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, field_validator

from app.db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "prelegal_session"
SESSION_LENGTH = timedelta(days=7)
JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 72  # bcrypt only uses the first 72 bytes and rejects longer passwords
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Db = Annotated[sqlite3.Connection, Depends(get_db)]


class User(BaseModel):
    id: int
    email: str


def normalise_email(email: str) -> str:
    return email.strip().lower()


class SignUpRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, email: str) -> str:
        email = normalise_email(email)
        if len(email) > 254 or not EMAIL_PATTERN.match(email):
            raise ValueError("Enter a valid email address.")
        return email

    @field_validator("password")
    @classmethod
    def valid_password(cls, password: str) -> str:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
        if len(password.encode()) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
        return password


class SignInRequest(BaseModel):
    email: str
    password: str


def _start_session(request: Request, response: Response, user_id: int) -> None:
    settings = request.app.state.settings
    token = jwt.encode(
        {"sub": str(user_id), "exp": datetime.now(UTC) + SESSION_LENGTH},
        settings.session_secret,
        algorithm=JWT_ALGORITHM,
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(SESSION_LENGTH.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def current_user(request: Request, db: Db) -> User:
    """FastAPI dependency: the signed-in user, or a 401 response."""
    not_signed_in = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise not_signed_in
    try:
        claims = jwt.decode(token, request.app.state.settings.session_secret, algorithms=[JWT_ALGORITHM])
        user_id = int(claims["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise not_signed_in
    row = db.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise not_signed_in
    return User(**row)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpRequest, request: Request, response: Response, db: Db) -> User:
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    try:
        cursor = db.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (body.email, password_hash))
    except sqlite3.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    _start_session(request, response, cursor.lastrowid)
    return User(id=cursor.lastrowid, email=body.email)


@router.post("/signin")
def sign_in(body: SignInRequest, request: Request, response: Response, db: Db) -> User:
    email = normalise_email(body.email)
    row = db.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    password = body.password.encode()
    if row is None or len(password) > MAX_PASSWORD_BYTES or not bcrypt.checkpw(password, row["password_hash"].encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    _start_session(request, response, row["id"])
    return User(id=row["id"], email=email)


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(request: Request, response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, httponly=True, samesite="lax", secure=request.app.state.settings.cookie_secure)


@router.get("/me")
def me(user: Annotated[User, Depends(current_user)]) -> User:
    return user
