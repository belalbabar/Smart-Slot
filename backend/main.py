from typing import Literal, Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User, Teacher
from auth import (hash_password, verify_password, create_token,
                  get_current_admin, get_current_hod)
from crud_routes import router
from session_routes import router as session_router
from timetable_routes import router as timetable_router

app = FastAPI(title="SmartSlot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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
    role: Literal["hod", "timetable"] = "timetable"
    teacher_id: Optional[int] = None
    display_name: Optional[str] = None


class UpdateUser(BaseModel):
    role: Literal["hod", "timetable"]
    teacher_id: Optional[int] = None
    display_name: Optional[str] = None


@app.get("/")
def home():
    return {"message": "SmartSlot is running"}


@app.post("/auth/login")
def login(data: LoginData, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong username or password")
    return {
        "token": create_token(user.id),
        "username": user.username,
        "display_name": user.display_name or (
            user.teacher.name if user.teacher else user.username
        ),
        "role": user.role,
        "teacher_id": user.teacher_id,
    }


@app.get("/auth/me")
def me(admin: User = Depends(get_current_admin)):
    return {"id": admin.id, "username": admin.username, "role": admin.role,
            "teacher_id": admin.teacher_id,
            "display_name": admin.display_name or (
                admin.teacher.name if admin.teacher else admin.username
            )}


@app.get("/users")
def list_users(db: Session = Depends(get_db),
               admin: User = Depends(get_current_hod)):
    return [{"id": u.id, "username": u.username, "role": u.role,
             "teacher_id": u.teacher_id, "display_name": u.display_name}
            for u in db.query(User).order_by(User.id).all()]


@app.post("/users")
def create_user(data: NewUser, db: Session = Depends(get_db),
                admin: User = Depends(get_current_hod)):
    username = data.username.strip()
    if len(username) < 3 or len(data.password) < 6:
        raise HTTPException(400, "Username min 3 and password min 6 characters")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username already exists")
    if data.role == "timetable" and data.teacher_id is None:
        if not (data.display_name or "").strip():
            raise HTTPException(400, "Enter a display name or select a linked teacher")
    if data.teacher_id is not None and not db.get(Teacher, data.teacher_id):
        raise HTTPException(400, "Teacher not found")
    if data.teacher_id is not None and db.query(User).filter(
            User.teacher_id == data.teacher_id).first():
        raise HTTPException(400, "This teacher already has a login account")
    user = User(username=username,
                password_hash=hash_password(data.password), role=data.role,
                teacher_id=data.teacher_id,
                display_name=(data.display_name or "").strip() or None)
    db.add(user)
    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role,
            "teacher_id": user.teacher_id, "display_name": user.display_name}


@app.put("/users/{user_id}")
def update_user(user_id: int, data: UpdateUser, db: Session = Depends(get_db),
                admin: User = Depends(get_current_hod)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if data.role == "timetable" and data.teacher_id is None:
        if not (data.display_name or "").strip():
            raise HTTPException(400, "Enter a display name or select a linked teacher")
    if data.teacher_id is not None and not db.get(Teacher, data.teacher_id):
        raise HTTPException(400, "Teacher not found")
    if data.teacher_id is not None and db.query(User).filter(
            User.teacher_id == data.teacher_id, User.id != user_id).first():
        raise HTTPException(400, "This teacher already has a login account")
    if user.id == admin.id and data.role not in ("hod", "timetable"):
        raise HTTPException(400, "Invalid account role")
    if user.role in ("hod", "admin") and data.role == "timetable":
        hod_count = db.query(User).filter(User.role.in_(("hod", "admin"))).count()
        if hod_count <= 1:
            raise HTTPException(400, "At least one HOD account must remain")
    user.role = data.role
    user.teacher_id = data.teacher_id
    user.display_name = (data.display_name or "").strip() or None
    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role,
            "teacher_id": user.teacher_id, "display_name": user.display_name}


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db),
                admin: User = Depends(get_current_hod)):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.role in ("hod", "admin"):
        hod_count = db.query(User).filter(User.role.in_(("hod", "admin"))).count()
        if hod_count <= 1:
            raise HTTPException(400, "At least one HOD account must remain")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}