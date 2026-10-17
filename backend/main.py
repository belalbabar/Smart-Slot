from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import (hash_password, verify_password, create_token,
                  get_current_admin)
from crud_routes import router
from session_routes import router as session_router
from timetable_routes import router as timetable_router

app = FastAPI(title="SmartSlot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(session_router)
app.include_router(timetable_router)

class LoginData(BaseModel):
    username: str
    password: str


class NewUser(BaseModel):
    username: str
    password: str


@app.get("/")
def home():
    return {"message": "SmartSlot is running"}


@app.post("/auth/login")
def login(data: LoginData, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong username or password")
    return {"token": create_token(user.id), "username": user.username}


@app.get("/auth/me")
def me(admin: User = Depends(get_current_admin)):
    return {"id": admin.id, "username": admin.username}


@app.get("/users")
def list_users(db: Session = Depends(get_db),
               admin: User = Depends(get_current_admin)):
    return [{"id": u.id, "username": u.username}
            for u in db.query(User).order_by(User.id).all()]


@app.post("/users")
def create_user(data: NewUser, db: Session = Depends(get_db),
                admin: User = Depends(get_current_admin)):
    username = data.username.strip()
    if len(username) < 3 or len(data.password) < 6:
        raise HTTPException(400, "Username min 3 and password min 6 characters")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username already exists")
    user = User(username=username,
                password_hash=hash_password(data.password), role="admin")
    db.add(user)
    db.commit()
    return {"id": user.id, "username": user.username}


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db),
                admin: User = Depends(get_current_admin)):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}