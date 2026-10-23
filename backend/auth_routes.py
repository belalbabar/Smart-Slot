import hashlib
import logging
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta
from email.message import EmailMessage
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from auth import hash_password
from database import get_db
from models import PasswordResetToken, User

router = APIRouter()
logger = logging.getLogger(__name__)
RESET_TOKEN_MINUTES = 2
RESET_EMAIL_COOLDOWN_SECONDS = 60
GENERIC_RESET_MESSAGE = (
    "If the account details match, a password reset link will be sent to its email."
)
INVALID_ACCOUNT_MESSAGE = (
    "Username and email do not match an account. Check the email set by the HOD."
)


class PasswordResetRequest(BaseModel):
    username: str
    email: str


class PasswordResetComplete(BaseModel):
    token: str
    username: str
    new_password: str


def smtp_settings():
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        raise HTTPException(503, "Password reset email is not configured correctly")

    parsed_url = urlsplit(frontend_url)
    if (
        not host or not username or not password or not sender
        or not parsed_url.scheme in ("http", "https") or not parsed_url.netloc
        or port < 1 or port > 65535
    ):
        raise HTTPException(503, "Password reset email is not configured")
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "sender": sender,
        "frontend_url": frontend_url,
        "use_ssl": os.getenv("SMTP_USE_SSL", "").lower() == "true",
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() == "true",
    }


def send_reset_email(settings, recipient, reset_url):
    message = EmailMessage()
    message["Subject"] = "Reset your SmartSlot password"
    message["From"] = settings["sender"]
    message["To"] = recipient
    message.set_content(
        "We received a request to reset your SmartSlot password.\n\n"
        f"Use this link within {RESET_TOKEN_MINUTES} minutes:\n{reset_url}\n\n"
        "If you did not request this reset, you can ignore this email."
    )
    if settings["use_ssl"]:
        with smtplib.SMTP_SSL(
            settings["host"], settings["port"], timeout=15,
            context=ssl.create_default_context(),
        ) as server:
            server.login(settings["username"], settings["password"])
            server.send_message(message)
        return

    with smtplib.SMTP(settings["host"], settings["port"], timeout=15) as server:
        if settings["use_tls"]:
            server.starttls(context=ssl.create_default_context())
        server.login(settings["username"], settings["password"])
        server.send_message(message)


@router.post("/auth/password-reset/request")
def request_password_reset(data: PasswordResetRequest,
                           db: Session = Depends(get_db)):
    username = data.username.strip()
    email = data.email.strip().lower()
    if len(email) > 254 or "@" not in email:
        return {"message": INVALID_ACCOUNT_MESSAGE}
    user = db.query(User).filter(
        User.username == username,
        User.email.isnot(None),
        func.lower(User.email) == email,
    ).first()
    if not user:
        return {"message": INVALID_ACCOUNT_MESSAGE}

    settings = smtp_settings()
    now = datetime.utcnow()
    recent_request = db.query(PasswordResetToken.id).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.created_at >= now - timedelta(
            seconds=RESET_EMAIL_COOLDOWN_SECONDS
        ),
    ).first()
    if recent_request:
        return {"message": GENERIC_RESET_MESSAGE}

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {PasswordResetToken.used_at: now},
        synchronize_session=False,
    )
    raw_token = secrets.token_urlsafe(32)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
    )
    db.add(reset_token)
    db.commit()

    reset_url = (
        f"{settings['frontend_url']}/reset-password?"
        f"{urlencode({'token': raw_token})}"
    )
    try:
        send_reset_email(settings, user.email, reset_url)
    except (OSError, smtplib.SMTPException, ValueError) as error:
        reset_token.used_at = datetime.utcnow()
        db.commit()
        logger.exception("Could not send SmartSlot password reset email")
        raise HTTPException(
            503, "Could not send the reset email right now. Please try again later."
        ) from error

    return {"message": GENERIC_RESET_MESSAGE}


@router.post("/auth/password-reset/complete")
def complete_password_reset(data: PasswordResetComplete,
                            db: Session = Depends(get_db)):
    if len(data.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if len(data.new_password.encode("utf-8")) > 72:
        raise HTTPException(400, "Password must be no more than 72 UTF-8 bytes")

    token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    now = datetime.utcnow()
    token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).first()
    if not token:
        raise HTTPException(400, "This reset link is invalid or has expired")

    user = db.get(User, token.user_id)
    if not user or user.username != data.username.strip():
        raise HTTPException(400, "This reset link does not match that username")

    claimed = db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.id == token.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise HTTPException(400, "This reset link is invalid or has expired")

    user.password_hash = hash_password(data.new_password)
    user.auth_version += 1
    db.commit()
    return {"message": "Password reset. Sign in with your new password."}
