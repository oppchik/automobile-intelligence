import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from . import models, schemas
from .database import get_db

PBKDF2_ROUNDS = 200_000
TOKEN_TTL_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

router = APIRouter()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(candidate.hex(), digest)
    except ValueError:
        return False


DUMMY_HASH = hash_password("dummy-password")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not EMAIL_RE.match(value):
        raise HTTPException(422, "Укажите корректный email")
    return value


def issue_token(db: Session, user: models.User) -> str:
    db.query(models.AuthSession).filter(models.AuthSession.expires_at < utcnow()).delete()
    token = secrets.token_urlsafe(32)
    db.add(models.AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=utcnow() + timedelta(days=TOKEN_TTL_DAYS),
    ))
    db.commit()
    return token


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        raise HTTPException(401, "Нужно войти в аккаунт")
    return value.strip()


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User | None:
    token = bearer_token(authorization)
    if token is None:
        return None
    session = (
        db.query(models.AuthSession)
        .filter(models.AuthSession.token_hash == hash_token(token))
        .first()
    )
    if session is None or session.expires_at < utcnow():
        raise HTTPException(401, "Сессия истекла, войдите снова")
    return db.get(models.User, session.user_id)


def get_current_user(user: models.User | None = Depends(get_optional_user)) -> models.User:
    if user is None:
        raise HTTPException(401, "Нужно войти в аккаунт")
    return user


def claim_anonymous_history(db: Session, user: models.User, session_id: str | None) -> int:
    if not session_id:
        return 0
    claimed = (
        db.query(models.HistoryEntry)
        .filter(models.HistoryEntry.session_id == session_id, models.HistoryEntry.user_id.is_(None))
        .update({models.HistoryEntry.user_id: user.id})
    )
    db.commit()
    return claimed


@router.post("/api/auth/register", response_model=schemas.AuthResponse)
def register(req: schemas.RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(req.email)
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(409, "Этот email уже зарегистрирован")
    name = (req.name or "").strip() or None
    user = models.User(email=email, name=name, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    claimed = claim_anonymous_history(db, user, req.session_id)
    return schemas.AuthResponse(token=issue_token(db, user), user=user, claimed=claimed)


@router.post("/api/auth/login", response_model=schemas.AuthResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    valid = verify_password(req.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(401, "Неверный email или пароль")
    claimed = claim_anonymous_history(db, user, req.session_id)
    return schemas.AuthResponse(token=issue_token(db, user), user=user, claimed=claimed)


@router.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = bearer_token(authorization)
    if token:
        db.query(models.AuthSession).filter(models.AuthSession.token_hash == hash_token(token)).delete()
        db.commit()
    return {"ok": True}


@router.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user
