from getpass import getpass
from database import SessionLocal
from models import User
from auth import hash_password

username = input("Admin username: ").strip()
password = getpass("Admin password: ")

db = SessionLocal()
if db.query(User).filter(User.username == username).first():
    print("Username already exists")
else:
    db.add(User(username=username, password_hash=hash_password(password), role="admin"))
    db.commit()
    print("Admin created")
db.close()