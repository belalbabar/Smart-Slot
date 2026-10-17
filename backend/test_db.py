from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    conn.execute(text("SELECT 1"))
    print("Database connected successfully")