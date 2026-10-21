from sqlalchemy import text

from database import engine


with engine.begin() as conn:
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR"
    ))

print("User display name column added")
