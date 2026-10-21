from sqlalchemy import text

from database import engine


with engine.begin() as conn:
    conn.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id "
        "INTEGER REFERENCES teachers(id)"
    ))

print("User teacher link column added")
