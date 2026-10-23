from sqlalchemy import text

from database import engine


with engine.begin() as connection:
    connection.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR"
    ))
    connection.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version "
        "INTEGER NOT NULL DEFAULT 0"
    ))
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP NULL
        )
    """))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id "
        "ON password_reset_tokens (user_id)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expires_at "
        "ON password_reset_tokens (expires_at)"
    ))

print("Password reset schema is ready")
