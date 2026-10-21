from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_hod, get_current_timetable_user, verify_password
from models import (AcademicSession, Degree, SessionDegree, Section,
                    Course, SectionCourse, Teacher, User, Timetable,
                    TimetableEntry, TeacherUnavailability)

router = APIRouter(dependencies=[Depends(get_current_timetable_user)])


def get_session_or_404(db, session_id):
    s = db.get(AcademicSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


def s_dict(s):
    return {"id": s.id, "name": s.name, "status": s.status,
            "archived_at": s.archived_at.isoformat() if s.archived_at else None}


def clean_name(data, field="name"):
    v = (data.get(field) or "").strip()
    if not v:
        raise HTTPException(400, f"{field} is required")
    return v


def teacher_or_none(db, value):
    if not value:
        return None
    tid = int(value)
    if not db.get(Teacher, tid):
        raise HTTPException(400, "Teacher not found")
    return tid


# ---------- Sessions ----------
@router.get("/sessions")
def list_sessions(status: str = "active", db: Session = Depends(get_db)):
    rows = (db.query(AcademicSession)
            .filter(AcademicSession.status == status)
            .order_by(AcademicSession.id).all())
    return [s_dict(s) for s in rows]


@router.post("/sessions")
def create_session(data: dict, db: Session = Depends(get_db)):
    name = clean_name(data)
    if db.query(AcademicSession).filter(
            func.lower(AcademicSession.name) == name.lower(),
            AcademicSession.status == "active").first():
        raise HTTPException(400, "Session already exists")
    s = AcademicSession(name=name)
    db.add(s)
    db.commit()
    return s_dict(s)


@router.put("/sessions/{session_id}")
def rename_session(session_id: int, data: dict, db: Session = Depends(get_db)):
    s = get_session_or_404(db, session_id)
    s.name = clean_name(data)
    db.query(Section).filter_by(session_id=s.id).update({"batch": s.name})
    db.commit()
    return s_dict(s)


@router.post("/sessions/{session_id}/archive")
def archive_session(session_id: int, data: dict, db: Session = Depends(get_db)):
    s = get_session_or_404(db, session_id)
    if (data.get("confirm") or "").strip() != s.name:
        raise HTTPException(400, "Type the session name exactly to confirm")
    s.status = "archived"
    s.archived_at = datetime.utcnow()
    db.commit()
    return s_dict(s)


@router.post("/sessions/{session_id}/restore")
def restore_session(session_id: int, db: Session = Depends(get_db)):
    s = get_session_or_404(db, session_id)
    s.status = "active"
    s.archived_at = None
    db.commit()
    return s_dict(s)


# ---------- Full tree of one session ----------
@router.get("/sessions/{session_id}/overview")
def overview(session_id: int, db: Session = Depends(get_db)):
    s = get_session_or_404(db, session_id)
    teachers = {t.id: t.name for t in db.query(Teacher).all()}
    degrees = []
    links = (db.query(SessionDegree).filter_by(session_id=session_id)
             .order_by(SessionDegree.id).all())
    for link in links:
        deg = db.get(Degree, link.degree_id)
        secs = (db.query(Section)
                .filter_by(session_id=session_id, degree_id=deg.id, status="active")
                .order_by(Section.name).all())
        sec_list = []
        for sec in secs:
            rows = (db.query(SectionCourse, Course)
                    .join(Course, Course.id == SectionCourse.course_id)
                    .filter(SectionCourse.section_id == sec.id)
                    .order_by(SectionCourse.id).all())
            sec_list.append({
                "id": sec.id, "name": sec.name,
                "courses": [{
                    "id": sc.id, "code": c.code, "name": c.name, "type": c.type,
                    "lab_kind": c.lab_kind,
                    "credit_hours": c.credit_hours,
                    "weekly_pattern": sc.weekly_pattern or c.weekly_pattern,
                    "teacher_id": sc.teacher_id,
                    "teacher_name": teachers.get(sc.teacher_id),
                } for sc, c in rows],
            })
        degrees.append({"id": deg.id, "name": deg.name, "sections": sec_list})
    return {"session": s_dict(s), "degrees": degrees}


# ---------- Degrees inside a session ----------
@router.post("/sessions/{session_id}/degrees")
def add_degree(session_id: int, data: dict, db: Session = Depends(get_db)):
    get_session_or_404(db, session_id)
    name = clean_name(data)
    degree = db.query(Degree).filter(func.lower(Degree.name) == name.lower()).first()
    if not degree:
        degree = Degree(name=name)
        db.add(degree)
        db.flush()
    if db.query(SessionDegree).filter_by(session_id=session_id, degree_id=degree.id).first():
        raise HTTPException(400, "Degree already added in this session")
    db.add(SessionDegree(session_id=session_id, degree_id=degree.id))
    db.commit()
    return {"id": degree.id, "name": degree.name}


@router.delete("/sessions/{session_id}/degrees/{degree_id}")
def remove_degree(session_id: int, degree_id: int, db: Session = Depends(get_db)):
    if db.query(Section).filter_by(session_id=session_id, degree_id=degree_id,
                                   status="active").first():
        raise HTTPException(400, "Remove its sections first")
    link = db.query(SessionDegree).filter_by(session_id=session_id,
                                             degree_id=degree_id).first()
    if not link:
        raise HTTPException(404, "Not found")
    db.delete(link)
    db.commit()
    return {"deleted": degree_id}


# ---------- Sections ----------
@router.post("/sessions/{session_id}/degrees/{degree_id}/sections")
def add_section(session_id: int, degree_id: int, data: dict,
                db: Session = Depends(get_db)):
    s = get_session_or_404(db, session_id)
    name = clean_name(data).upper()
    if not db.query(SessionDegree).filter_by(session_id=session_id,
                                             degree_id=degree_id).first():
        raise HTTPException(404, "Add the degree first")
    if db.query(Section).filter_by(session_id=session_id, degree_id=degree_id,
                                   name=name, status="active").first():
        raise HTTPException(400, "Section already exists")
    sec = Section(session_id=session_id, degree_id=degree_id, batch=s.name, name=name)
    db.add(sec)
    db.commit()
    return {"id": sec.id, "name": sec.name}


@router.put("/sections/{section_id}")
def rename_section(section_id: int, data: dict, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section or section.status != "active":
        raise HTTPException(404, "Section not found")
    name = clean_name(data).upper()
    duplicate = db.query(Section).filter(
        Section.session_id == section.session_id,
        Section.degree_id == section.degree_id,
        Section.name == name,
        Section.status == "active",
        Section.id != section.id,
    ).first()
    if duplicate:
        raise HTTPException(400, "Section already exists")
    section.name = name
    db.commit()
    return {"id": section.id, "name": section.name}


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, data: dict, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    admin_username = (data.get("admin_username") or "").strip()
    password = data.get("password")
    admin = db.query(User).filter(
        User.username == admin_username,
        User.role.in_(("admin", "hod")),
    ).first()
    if not admin or not isinstance(password, str) or not verify_password(
            password, admin.password_hash):
        raise HTTPException(403, "HOD username or password is incorrect")

    section_course_ids = [row[0] for row in db.query(SectionCourse.id)
                          .filter_by(section_id=section_id).all()]
    timetable_ids = [row[0] for row in db.query(Timetable.id)
                     .filter(Timetable.section_id == section_id).all()]
    if timetable_ids:
        db.query(TeacherUnavailability).filter(
            TeacherUnavailability.timetable_id.in_(timetable_ids)
        ).delete(synchronize_session=False)
    entry_filter = []
    if timetable_ids:
        entry_filter.append(TimetableEntry.timetable_id.in_(timetable_ids))
    if section_course_ids:
        entry_filter.append(
            TimetableEntry.section_course_id.in_(section_course_ids))
    if entry_filter:
        db.query(TimetableEntry).filter(
            or_(*entry_filter)
        ).delete(synchronize_session=False)
    if timetable_ids:
        db.query(Timetable).filter(
            Timetable.id.in_(timetable_ids)
        ).delete(synchronize_session=False)
    db.query(SectionCourse).filter_by(section_id=section_id).delete(
        synchronize_session=False)
    db.delete(section)
    db.commit()
    return {"deleted": section_id}


# ---------- Courses (with teacher) inside a section ----------
@router.post("/sections/{section_id}/courses")
def add_course(section_id: int, data: dict, db: Session = Depends(get_db)):
    if not db.get(Section, section_id):
        raise HTTPException(404, "Section not found")
    code = clean_name(data, "code")
    cname = clean_name(data, "name")
    ctype = data.get("type")
    if ctype not in ("lab", "theory"):
        raise HTTPException(400, "type must be lab or theory")
    lab_kind = (data.get("lab_kind") or "").strip() or None
    if ctype == "lab" and lab_kind not in ("hardware", "software"):
        raise HTTPException(400, "Choose lab kind: hardware or software")
    if ctype != "lab":
        lab_kind = None
    try:
        credit = int(data.get("credit_hours"))
    except Exception:
        raise HTTPException(400, "credit_hours must be a number")
    pattern = "3" if ctype == "lab" else (data.get("weekly_pattern") or "").strip()
    if not pattern:
        raise HTTPException(400, "weekly_pattern is required")
    if ctype == "theory" and pattern not in ("3", "2+1", "1+1+1", "2", "1"):
        raise HTTPException(400, "Choose a valid weekly pattern")
    teacher_id = teacher_or_none(db, data.get("teacher_id"))

    course = db.query(Course).filter(func.lower(Course.code) == code.lower()).first()
    if not course:
        course = Course(code=code, name=cname, type=ctype,
                        credit_hours=credit, weekly_pattern=pattern, lab_kind=lab_kind)
        db.add(course)
        db.flush()
    if db.query(SectionCourse).filter_by(section_id=section_id,
                                         course_id=course.id).first():
        raise HTTPException(400, "Course already added in this section")
    pattern_override = (
        pattern if ctype == "theory" and pattern != course.weekly_pattern else None
    )
    sc = SectionCourse(section_id=section_id, course_id=course.id,
                       teacher_id=teacher_id, weekly_pattern=pattern_override)
    db.add(sc)
    db.commit()
    return {"id": sc.id}


@router.put("/section-courses/{sc_id}")
def set_teacher(sc_id: int, data: dict, db: Session = Depends(get_db)):
    sc = db.get(SectionCourse, sc_id)
    if not sc:
        raise HTTPException(404, "Not found")
    if "teacher_id" in data:
        sc.teacher_id = teacher_or_none(db, data.get("teacher_id"))
    if "weekly_pattern" in data:
        pattern = (data.get("weekly_pattern") or "").strip()
        course = db.get(Course, sc.course_id)
        if course.type != "theory" or pattern not in (
                "3", "2+1", "1+1+1", "2", "1"):
            raise HTTPException(400, "Choose a valid theory weekly pattern")
        sc.weekly_pattern = pattern
    db.commit()
    course = db.get(Course, sc.course_id)
    return {"id": sc.id, "teacher_id": sc.teacher_id,
            "weekly_pattern": sc.weekly_pattern or course.weekly_pattern}


@router.delete("/section-courses/{sc_id}")
def remove_course(sc_id: int, db: Session = Depends(get_db)):
    sc = db.get(SectionCourse, sc_id)
    if not sc:
        raise HTTPException(404, "Not found")
    db.delete(sc)
    db.commit()
    return {"deleted": sc_id}
# ---------- Sidebar tree ----------
@router.get("/tree")
def tree(db: Session = Depends(get_db)):
    out = []
    sessions = (db.query(AcademicSession)
                .filter(AcademicSession.status == "active")
                .order_by(AcademicSession.id).all())
    for s in sessions:
        degs = []
        links = (db.query(SessionDegree).filter_by(session_id=s.id)
                 .order_by(SessionDegree.id).all())
        for link in links:
            deg = db.get(Degree, link.degree_id)
            secs = (db.query(Section)
                    .filter_by(session_id=s.id, degree_id=deg.id, status="active")
                    .order_by(Section.name).all())
            degs.append({"id": deg.id, "name": deg.name,
                         "sections": [{"id": x.id, "name": x.name} for x in secs]})
        out.append({"id": s.id, "name": s.name, "degrees": degs})
    return out


# ---------- Teacher workload ----------
@router.get("/teacher-workload")
def teacher_workload(db: Session = Depends(get_db),
                     admin: User = Depends(get_current_hod)):
    out = []
    for t in db.query(Teacher).order_by(Teacher.name).all():
        rows = (db.query(SectionCourse, Course, Section, AcademicSession, Degree)
                .join(Course, Course.id == SectionCourse.course_id)
                .join(Section, Section.id == SectionCourse.section_id)
                .join(AcademicSession, AcademicSession.id == Section.session_id)
                .join(Degree, Degree.id == Section.degree_id)
                .filter(SectionCourse.teacher_id == t.id,
                        Section.status == "active",
                        AcademicSession.status == "active")
                .all())
        classes = []
        hours = 0
        for sc, c, sec, ses, deg in rows:
            h = 3 if c.type == "lab" else c.credit_hours
            hours += h
            classes.append({"session": ses.name, "degree": deg.name,
                            "section": sec.name, "code": c.code,
                            "course": c.name, "type": c.type, "hours": h})
        out.append({"id": t.id, "name": t.name, "email": t.email,
                    "course_count": len(classes), "weekly_hours": hours,
                    "classes": classes})
    return out
# ---------- Course list (dropdown ke liye) ----------
@router.get("/courses")
def list_courses(db: Session = Depends(get_db)):
    return [{"id": c.id, "code": c.code, "name": c.name, "type": c.type,
             "credit_hours": c.credit_hours,              "weekly_pattern": sc.weekly_pattern or c.weekly_pattern,
             "lab_kind": c.lab_kind}
            for c in db.query(Course).order_by(Course.code).all()]


# ---------- Section archive ----------
@router.post("/sections/{section_id}/archive")
def archive_section(section_id: int, db: Session = Depends(get_db)):
    sec = db.get(Section, section_id)
    if not sec:
        raise HTTPException(404, "Section not found")
    sec.status = "archived"
    sec.archived_at = datetime.utcnow()
    db.commit()
    return {"archived": section_id}


# ---------- Ek section ke courses doosre section mein copy ----------
@router.post("/sections/{section_id}/copy-from/{source_id}")
def copy_section_courses(section_id: int, source_id: int,
                         db: Session = Depends(get_db)):
    if section_id == source_id:
        raise HTTPException(400, "Choose a different section")
    if not db.get(Section, section_id) or not db.get(Section, source_id):
        raise HTTPException(404, "Section not found")
    have = {sc.course_id for sc in
            db.query(SectionCourse).filter_by(section_id=section_id).all()}
    n = 0
    for sc in db.query(SectionCourse).filter_by(section_id=source_id).all():
        if sc.course_id in have:
            continue
        db.add(SectionCourse(section_id=section_id, course_id=sc.course_id,
                             teacher_id=sc.teacher_id,
                             weekly_pattern=sc.weekly_pattern))
        n += 1
    db.commit()
    return {"copied": n}