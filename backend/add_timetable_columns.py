from sqlalchemy import text
from database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE timetables ADD COLUMN IF NOT EXISTS settings TEXT"))
    conn.execute(text("ALTER TABLE timetables ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES sections(id)"))
print("Columns added")