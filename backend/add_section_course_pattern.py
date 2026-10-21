from sqlalchemy import text

from database import engine


with engine.begin() as conn:
    conn.execute(text(
        "ALTER TABLE section_courses ADD COLUMN IF NOT EXISTS weekly_pattern VARCHAR"
    ))

print("Section course weekly pattern column added")
