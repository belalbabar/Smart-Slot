from sqlalchemy import text

from database import engine


with engine.begin() as conn:
    conn.execute(text(
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS phone VARCHAR"
    ))

print("Teacher phone column added")
