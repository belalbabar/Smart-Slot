from sqlalchemy import text
from database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lab_kind VARCHAR"))
    conn.execute(text("ALTER TABLE courses ADD COLUMN IF NOT EXISTS lab_kind VARCHAR"))
print("Columns added")