from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_admin
from database import get_db
from models import (
    StudentAffairsNotification,
    StudentAffairsTask,
    Teacher,
    User,
)

router = APIRouter()
HOD_ROLES = ("admin", "hod")
STUDENT_AFFAIRS_ROLES = HOD_ROLES + ("student_affairs",)


def today_utc() -> date:
    return datetime.utcnow().date()


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    complaint_details: str = Field(min_length=1, max_length=10000)
    student_name: str = Field(min_length=1, max_length=120)
    roll_number: str = Field(min_length=1, max_length=80)


class TaskComplete(BaseModel):
    resolution_note: str = Field(min_length=1, max_length=500)


class DeadlineExtension(BaseModel):
    due_date: date


def teacher_for_user(user: User, db: Session) -> Teacher:
    if user.teacher_id is None:
        raise HTTPException(
            400, "Link this login to a teacher profile before creating tasks"
        )
    teacher = db.get(Teacher, user.teacher_id)
    if not teacher:
        raise HTTPException(400, "The linked teacher profile no longer exists")
    return teacher


def ensure_student_affairs_access(user: User, db: Session) -> None:
    if user.role in STUDENT_AFFAIRS_ROLES:
        return
    if user.role == "timetable":
        teacher_for_user(user, db)
        return
    raise HTTPException(403, "Student Affairs access required")


def escalate_overdue_tasks(db: Session) -> None:
    today = today_utc()
    overdue = db.query(StudentAffairsTask).filter(
        StudentAffairsTask.status == "open",
        StudentAffairsTask.deleted_at.is_(None),
        StudentAffairsTask.escalated.is_(False),
        StudentAffairsTask.due_date < today,
    ).with_for_update(skip_locked=True).all()
    if not overdue:
        return

    module_users = db.query(User).filter(
        User.role.in_(STUDENT_AFFAIRS_ROLES)
    ).all()
    now = datetime.utcnow()
    for task in overdue:
        task.escalated = True
        task.escalated_at = now
        for module_user in module_users:
            db.add(StudentAffairsNotification(
                user_id=module_user.id,
                task_id=task.id,
                kind="escalation",
                message=(
                    f"{task.title} for {task.student_name} "
                    f"({task.roll_number}) is overdue."
                ),
                is_red=True,
            ))
    db.commit()


def task_dict(task: StudentAffairsTask, today: date) -> dict:
    overdue_days = max((today - task.due_date).days, 0) if task.escalated else 0
    return {
        "id": task.id,
        "teacher_id": task.teacher_id,
        "teacher_name": task.teacher.name if task.teacher else "",
        "title": task.title,
        "complaint_details": task.complaint_details,
        "student_name": task.student_name,
        "roll_number": task.roll_number,
        "status": task.status,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "due_date": task.due_date.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "resolution_note": task.resolution_note,
        "escalated": task.escalated,
        "overdue_days": overdue_days,
    }


def get_task(task_id: int, db: Session) -> StudentAffairsTask:
    task = db.get(StudentAffairsTask, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(404, "Task not found")
    return task


def can_manage_task(task: StudentAffairsTask, user: User) -> bool:
    return user.role in STUDENT_AFFAIRS_ROLES or (
        user.role == "timetable" and user.teacher_id == task.teacher_id
    )


def notify_teacher(
    task: StudentAffairsTask, db: Session, kind: str, message: str
) -> None:
    teacher_users = db.query(User).filter(
        User.teacher_id == task.teacher_id,
        User.role == "timetable",
    ).all()
    if not teacher_users:
        raise HTTPException(
            400, "No timetable login is linked to this teacher profile"
        )
    for teacher_user in teacher_users:
        db.add(StudentAffairsNotification(
            user_id=teacher_user.id,
            task_id=task.id,
            kind=kind,
            message=message,
            is_red=False,
        ))


def get_student_affairs_manager(
    user: User = Depends(get_current_admin),
) -> User:
    if user.role not in STUDENT_AFFAIRS_ROLES:
        raise HTTPException(403, "Student Affairs manager access required")
    return user


@router.post("/student-affairs/tasks")
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    if user.role not in ("timetable", "student_affairs"):
        raise HTTPException(403, "Only teacher-linked accounts can create tasks")
    teacher = teacher_for_user(user, db)
    values = {
        "title": data.title.strip(),
        "complaint_details": data.complaint_details.strip(),
        "student_name": data.student_name.strip(),
        "roll_number": data.roll_number.strip(),
    }
    if any(not value for value in values.values()):
        raise HTTPException(400, "All task fields are required")
    now = datetime.utcnow()
    task = StudentAffairsTask(
        teacher_id=teacher.id,
        created_at=now,
        due_date=now.date() + timedelta(days=14),
        **values,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_dict(task, now.date())


@router.get("/student-affairs/tasks")
def list_tasks(
    status: str = "open",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    ensure_student_affairs_access(user, db)
    if status not in ("open", "completed", "all"):
        raise HTTPException(400, "Status must be open, completed, or all")
    escalate_overdue_tasks(db)
    query = db.query(StudentAffairsTask).filter(
        StudentAffairsTask.deleted_at.is_(None)
    )
    if user.role not in STUDENT_AFFAIRS_ROLES:
        teacher_for_user(user, db)
        query = query.filter(StudentAffairsTask.teacher_id == user.teacher_id)
    if status != "all":
        query = query.filter(StudentAffairsTask.status == status)
    tasks = query.order_by(
        StudentAffairsTask.escalated.desc(),
        StudentAffairsTask.due_date.asc(),
        StudentAffairsTask.created_at.desc(),
    ).all()
    today = today_utc()
    return [task_dict(task, today) for task in tasks]


@router.post("/student-affairs/tasks/{task_id}/complete")
def complete_task(
    task_id: int,
    data: TaskComplete,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    ensure_student_affairs_access(user, db)
    task = get_task(task_id, db)
    if not can_manage_task(task, user):
        raise HTTPException(403, "You can only resolve your own tasks")
    if task.status != "open":
        raise HTTPException(400, "Only open tasks can be completed")
    note = data.resolution_note.strip()
    if not note:
        raise HTTPException(400, "Enter a short resolution note")
    task.status = "completed"
    task.completed_at = datetime.utcnow()
    task.resolution_note = note
    task.escalated = False
    task.escalated_at = None
    db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.task_id == task.id,
        StudentAffairsNotification.kind == "escalation",
        StudentAffairsNotification.user_id.in_(
            db.query(User.id).filter(User.role.in_(STUDENT_AFFAIRS_ROLES))
        ),
        StudentAffairsNotification.read_at.is_(None),
    ).update(
        {StudentAffairsNotification.read_at: datetime.utcnow()},
        synchronize_session=False,
    )
    db.commit()
    return task_dict(task, today_utc())


@router.post("/student-affairs/tasks/{task_id}/remind")
def remind_teacher(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_student_affairs_manager),
):
    ensure_student_affairs_access(user, db)
    task = get_task(task_id, db)
    if not task.escalated or task.status != "open":
        raise HTTPException(400, "Only open escalated tasks can be reminded")
    actor_name = "HOD" if user.role in HOD_ROLES else "Student Affairs"
    notify_teacher(
        task, db, "reminder", f"{actor_name} sent a reminder: {task.title}"
    )
    db.commit()
    return {"message": "Reminder sent to the teacher"}


@router.put("/student-affairs/tasks/{task_id}/deadline")
def extend_deadline(
    task_id: int,
    data: DeadlineExtension,
    db: Session = Depends(get_db),
    user: User = Depends(get_student_affairs_manager),
):
    task = get_task(task_id, db)
    if not task.escalated or task.status != "open":
        raise HTTPException(400, "Only open escalated tasks can be extended")
    if data.due_date <= max(task.due_date, today_utc()):
        raise HTTPException(
            400, "Extended deadline must be a future date after the current deadline"
        )
    task.due_date = data.due_date
    task.escalated = False
    task.escalated_at = None
    db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.task_id == task.id,
        StudentAffairsNotification.kind == "escalation",
        StudentAffairsNotification.user_id.in_(
            db.query(User.id).filter(User.role.in_(STUDENT_AFFAIRS_ROLES))
        ),
        StudentAffairsNotification.read_at.is_(None),
    ).update(
        {StudentAffairsNotification.read_at: datetime.utcnow()},
        synchronize_session=False,
    )
    notify_teacher(
        task,
        db,
        "deadline_extended",
        f"{'HOD' if user.role in HOD_ROLES else 'Student Affairs'} extended "
        f"the deadline for {task.title} to {task.due_date.isoformat()}.",
    )
    db.commit()
    return task_dict(task, today_utc())


@router.delete("/student-affairs/tasks/{task_id}")
def soft_delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    task = get_task(task_id, db)
    if not can_manage_task(task, user):
        raise HTTPException(403, "You can only remove your own tasks")
    task.deleted_at = datetime.utcnow()
    db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.task_id == task.id,
        StudentAffairsNotification.kind == "escalation",
        StudentAffairsNotification.user_id.in_(
            db.query(User.id).filter(User.role.in_(STUDENT_AFFAIRS_ROLES))
        ),
        StudentAffairsNotification.read_at.is_(None),
    ).update(
        {StudentAffairsNotification.read_at: datetime.utcnow()},
        synchronize_session=False,
    )
    db.commit()
    return {"deleted": task.id}


@router.get("/student-affairs/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    ensure_student_affairs_access(user, db)
    escalate_overdue_tasks(db)
    notifications = db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.user_id == user.id,
    ).order_by(
        StudentAffairsNotification.created_at.desc(),
        StudentAffairsNotification.id.desc(),
    ).limit(50).all()
    unread_count = db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.user_id == user.id,
        StudentAffairsNotification.read_at.is_(None),
    ).count()
    unread_escalation_count = db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.user_id == user.id,
        StudentAffairsNotification.kind == "escalation",
        StudentAffairsNotification.read_at.is_(None),
    ).count()
    return {
        "unread_count": unread_count,
        "unread_escalation_count": unread_escalation_count,
        "items": [{
            "id": item.id,
            "task_id": item.task_id,
            "kind": item.kind,
            "message": item.message,
            "is_red": item.is_red,
            "created_at": item.created_at.isoformat(),
            "read": item.read_at is not None,
        } for item in notifications],
    }


@router.post("/student-affairs/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin),
):
    ensure_student_affairs_access(user, db)
    notification = db.query(StudentAffairsNotification).filter(
        StudentAffairsNotification.id == notification_id,
        StudentAffairsNotification.user_id == user.id,
    ).first()
    if not notification:
        raise HTTPException(404, "Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        db.commit()
    return {"read": True}
