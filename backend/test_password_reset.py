import hashlib
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth import hash_password, verify_password
from auth_routes import (
    INVALID_ACCOUNT_MESSAGE,
    PasswordResetComplete,
    PasswordResetRequest,
    complete_password_reset,
    request_password_reset,
)
from database import Base
from models import PasswordResetToken, User


class PasswordResetTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            username="hod-test",
            password_hash=hash_password("old-password"),
            role="hod",
            email="hod@example.com",
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)
        self.smtp_environment = patch.dict(os.environ, {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "smartslot@example.com",
            "SMTP_PASSWORD": "test-only-password",
            "SMTP_FROM_EMAIL": "smartslot@example.com",
            "SMTP_USE_TLS": "true",
            "SMTP_USE_SSL": "false",
            "FRONTEND_URL": "https://smartslot.example.com",
        })
        self.smtp_environment.start()

    def tearDown(self):
        self.smtp_environment.stop()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    @patch("auth_routes.send_reset_email")
    def test_matching_account_gets_hashed_one_time_link(self, send_email):
        result = request_password_reset(
            PasswordResetRequest(username="hod-test", email="HOD@example.com"),
            self.db,
        )

        self.assertEqual(result["message"].startswith("If the account details match"), True)
        send_email.assert_called_once()
        recipient, reset_url = send_email.call_args.args[1:]
        self.assertEqual(recipient, "hod@example.com")
        self.assertEqual(urlsplit(reset_url).scheme, "https")

        raw_token = parse_qs(urlsplit(reset_url).query)["token"][0]
        stored = self.db.query(PasswordResetToken).one()
        self.assertEqual(
            stored.token_hash,
            hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        )
        self.assertNotEqual(stored.token_hash, raw_token)

    @patch("auth_routes.send_reset_email")
    def test_unregistered_email_returns_invalid_message_without_sending(self, send_email):
        result = request_password_reset(
            PasswordResetRequest(username="hod-test", email="other@example.com"),
            self.db,
        )

        self.assertEqual(result["message"], INVALID_ACCOUNT_MESSAGE)
        send_email.assert_not_called()
        self.assertEqual(self.db.query(PasswordResetToken).count(), 0)

    @patch("auth_routes.send_reset_email")
    def test_unknown_username_returns_invalid_message_without_sending(self, send_email):
        result = request_password_reset(
            PasswordResetRequest(username="wrong-user", email="hod@example.com"),
            self.db,
        )

        self.assertEqual(result["message"], INVALID_ACCOUNT_MESSAGE)
        send_email.assert_not_called()
        self.assertEqual(self.db.query(PasswordResetToken).count(), 0)

    @patch("auth_routes.send_reset_email")
    def test_recent_reset_requests_do_not_send_duplicate_emails(self, send_email):
        request = PasswordResetRequest(
            username="hod-test", email="hod@example.com"
        )

        first = request_password_reset(request, self.db)
        second = request_password_reset(request, self.db)

        self.assertEqual(first, second)
        send_email.assert_called_once()
        self.assertEqual(self.db.query(PasswordResetToken).count(), 1)

    @patch("auth_routes.send_reset_email", side_effect=OSError("mail server unavailable"))
    def test_mail_failure_is_reported_and_token_is_invalidated(self, send_email):
        with self.assertRaises(HTTPException) as error:
            request_password_reset(
                PasswordResetRequest(
                    username="hod-test", email="hod@example.com"
                ),
                self.db,
            )

        self.assertEqual(error.exception.status_code, 503)
        self.assertIsNotNone(self.db.query(PasswordResetToken).one().used_at)

    @patch("auth_routes.send_reset_email")
    def test_reset_changes_password_invalidates_sessions_and_token_is_single_use(
        self, send_email
    ):
        request_password_reset(
            PasswordResetRequest(username="hod-test", email="hod@example.com"),
            self.db,
        )
        reset_url = send_email.call_args.args[2]
        raw_token = parse_qs(urlsplit(reset_url).query)["token"][0]
        starting_version = self.user.auth_version

        result = complete_password_reset(
            PasswordResetComplete(
                token=raw_token,
                username="hod-test",
                new_password="new-safe-password",
            ),
            self.db,
        )

        self.db.refresh(self.user)
        self.assertIn("Password reset", result["message"])
        self.assertTrue(verify_password("new-safe-password", self.user.password_hash))
        self.assertFalse(verify_password("old-password", self.user.password_hash))
        self.assertEqual(self.user.auth_version, starting_version + 1)
        with self.assertRaises(HTTPException) as error:
            complete_password_reset(
                PasswordResetComplete(
                    token=raw_token,
                    username="hod-test",
                    new_password="another-password",
                ),
                self.db,
            )
        self.assertEqual(error.exception.status_code, 400)

    def test_reset_requires_matching_username_and_password_length(self):
        token = PasswordResetToken(
            user_id=self.user.id,
            token_hash=hashlib.sha256(b"valid-token").hexdigest(),
            expires_at=datetime.utcnow() + timedelta(minutes=2),
        )
        self.db.add(token)
        self.db.commit()

        with self.assertRaises(HTTPException) as wrong_username:
            complete_password_reset(
                PasswordResetComplete(
                    token="valid-token",
                    username="other-user",
                    new_password="new-safe-password",
                ),
                self.db,
            )
        self.assertEqual(wrong_username.exception.status_code, 400)

        with self.assertRaises(HTTPException) as short_password:
            complete_password_reset(
                PasswordResetComplete(
                    token="valid-token",
                    username="hod-test",
                    new_password="short",
                ),
                self.db,
            )
        self.assertEqual(short_password.exception.status_code, 400)

    def test_expired_token_cannot_reset_password(self):
        token = PasswordResetToken(
            user_id=self.user.id,
            token_hash=hashlib.sha256(b"expired-token").hexdigest(),
            expires_at=datetime.utcnow() - timedelta(seconds=1),
        )
        self.db.add(token)
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            complete_password_reset(
                PasswordResetComplete(
                    token="expired-token",
                    username="hod-test",
                    new_password="new-safe-password",
                ),
                self.db,
            )
        self.assertEqual(error.exception.status_code, 400)
        self.assertTrue(verify_password("old-password", self.user.password_hash))


if __name__ == "__main__":
    unittest.main()
