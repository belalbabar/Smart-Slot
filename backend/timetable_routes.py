import json
from datetime import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ortools.sat.python import cp_model
from datetime import time, datetime

from database import get_db
from auth import get_current_admin
from models import (AcademicSession, Section, SectionCourse, Course, Teacher,
                    Room, Degree, Timetable, TimetableEntry,
                    TeacherUnavailability)

router = APIRouter(dependencies=[Depends(get_current_admin)])

ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def blocks_of(course):
    if course.type == "lab":
        return [3]
    try:
        return [int(x) for x in course.weekly_pattern.split("+")]
    except Exception:
        raise HTTPException(400, f"Invalid weekly pattern for {course.code}")


def to_int(data, key, default):
    try:
        return int(data.get(key, default))
    except Exception:
        raise HTTPException(400, f"{key} must be a number")


@router.post("/sections/{section_id}/generate")
def generate(section_id: int, data: dict, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section or section.status != "active":
        raise HTTPException(404, "Section not found")
    ses = db.get(AcademicSession, section.session_id)
    deg = db.get(Degree, section.degree_id)

    days = [d for d in ALL_DAYS if d in (data.get("days") or [])]
    if not days:
        raise HTTPException(400, "Choose at least one working day")
    ds = to_int(data, "day_start", 8)
    de = to_int(data, "day_end", 17)
    ls = to_int(data, "lunch_start", 12)
    le = to_int(data, "lunch_end", 13)
    if not (0 <= ds < de <= 23):
        raise HTTPException(400, "Invalid day start/end time")
    hours = [h for h in range(ds, de) if not (ls <= h < le)]
    hourset = set(hours)

    unavail = set()
    unavail_rows = []
    for u in data.get("unavailable") or []:
        for d in u.get("days") or []:
            unavail.add((int(u["teacher_id"]), d))
            unavail_rows.append((int(u["teacher_id"]), d))

    items = (db.query(SectionCourse, Course)
             .join(Course, Course.id == SectionCourse.course_id)
             .filter(SectionCourse.section_id == section_id).all())
    if not items:
        raise HTTPException(400, "No courses added in this section yet")

    rooms = db.query(Room).all()
    theory_rooms = [r.id for r in rooms if r.type == "theory"]

    def lab_rooms(kind):
        return [r.id for r in rooms if r.type == "lab" and r.lab_kind == kind]

    # baqi saare sections ka current timetable: unka teacher/room busy hai
    latest = {}
    for t in (db.query(Timetable)
              .join(Section, Section.id == Timetable.section_id)
              .filter(Timetable.status == "active",
                      Timetable.section_id != section_id,
                      Section.status == "active")
              .order_by(Timetable.id).all()):
        latest[t.section_id] = t.id
    busy_t, busy_r = set(), set()
    if latest:
        rows = (db.query(TimetableEntry, SectionCourse)
                .join(SectionCourse, SectionCourse.id == TimetableEntry.section_course_id)
                .filter(TimetableEntry.timetable_id.in_(list(latest.values()))).all())
        for e, sc in rows:
            for h in range(e.start_time.hour, e.end_time.hour):
                if sc.teacher_id:
                    busy_t.add((sc.teacher_id, e.day, h))
                busy_r.add((e.room_id, e.day, h))

    model = cp_model.CpModel()
    placements = []
    sec_busy, teacher_busy, room_busy, day_vars = {}, {}, {}, {}
    day_load = {d: [] for d in days}
    morning, afternoon = [], []

    for sc, c in items:
        cand_rooms = lab_rooms(c.lab_kind) if c.type == "lab" else theory_rooms
        if not cand_rooms:
            what = f"{c.lab_kind} lab" if c.type == "lab" else "theory room"
            raise HTTPException(400, f"No {what} available for {c.code}. "
                                     f"Add it in Admin > Rooms & Labs.")
        for length in blocks_of(c):
            opts = []
            for day in days:
                if sc.teacher_id and (sc.teacher_id, day) in unavail:
                    continue
                for s in hours:
                    span = list(range(s, s + length))
                    if any(h not in hourset for h in span):
                        continue
                    if sc.teacher_id and any((sc.teacher_id, day, h) in busy_t for h in span):
                        continue
                    for r in cand_rooms:
                        if any((r, day, h) in busy_r for h in span):
                            continue
                        v = model.NewBoolVar("")
                        opts.append(v)
                        placements.append((v, sc, length, day, s, r))
                        day_vars.setdefault((sc.id, day), []).append(v)
                        day_load[day].append(length * v)
                        (morning if s < ls else afternoon).append(length * v)
                        for h in span:
                            sec_busy.setdefault((day, h), []).append(v)
                            room_busy.setdefault((r, day, h), []).append(v)
                            if sc.teacher_id:
                                teacher_busy.setdefault((sc.teacher_id, day, h), []).append(v)
            if not opts:
                raise HTTPException(
                    400, f"No free slot left for {c.code}. Other sections already "
                         f"use the teacher/rooms at the possible times. Try adding a "
                         f"working day, extending timings, or adding rooms/labs.")
            model.AddExactlyOne(opts)

    for group in (sec_busy, teacher_busy, room_busy, day_vars):
        for vs in group.values():
            if len(vs) > 1:
                model.AddAtMostOne(vs)

    # classes dino mein barabar, aur lunch se pehle/baad barabar
    max_day = model.NewIntVar(0, len(hours), "max_day")
    for d in days:
        model.Add(sum(day_load[d]) <= max_day)
    diff = model.NewIntVar(0, 200, "diff")
    model.Add(sum(morning) - sum(afternoon) <= diff)
    model.Add(sum(afternoon) - sum(morning) <= diff)
    model.Minimize(10 * max_day + diff)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    solver.parameters.num_workers = 8
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        raise HTTPException(
            400, "Clash: a clash-free timetable is not possible for this section "
                 "with the current settings (other sections already use some "
                 "slots). Try adding a working day, extending the timings, "
                 "adding rooms/labs, or removing a teacher's unavailable day.")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise HTTPException(400, "Solver could not finish in time. "
                                 "Try fewer constraints and generate again.")

    # is section ke purane timetables history mein chale jayen
    db.query(Timetable).filter_by(section_id=section_id, status="active") \
        .update({"status": "old"})

    default_name = f"{deg.name} - Section {section.name} ({ses.name})"
    tt = Timetable(name=(data.get("name") or "").strip() or default_name,
                   session_id=section.session_id, section_id=section_id,
                   settings=json.dumps({
                       "days": days, "day_start": ds, "day_end": de,
                       "lunch_start": ls, "lunch_end": le}))
    db.add(tt)
    db.flush()
    count = 0
    for v, sc, length, day, s, r in placements:
        if solver.Value(v):
            db.add(TimetableEntry(timetable_id=tt.id, section_course_id=sc.id,
                                  room_id=r, day=day, start_time=time(s),
                                  end_time=time(s + length)))
            count += 1
    for tid, d in unavail_rows:
        db.add(TeacherUnavailability(timetable_id=tt.id, teacher_id=tid, day=d))
    db.commit()

    no_teacher = sorted({c.code for sc, c in items if not sc.teacher_id})
    warnings = []
    if no_teacher:
        warnings.append("Teacher not assigned for: " + ", ".join(no_teacher)
                        + ". Teacher clashes are not checked for these.")
    return {"id": tt.id, "classes": count,
            "solve_seconds": round(solver.WallTime(), 2), "warnings": warnings}


@router.get("/sections/{section_id}/timetables")
def section_timetables(section_id: int, db: Session = Depends(get_db)):
    rows = (db.query(Timetable)
            .filter(Timetable.section_id == section_id,
                    Timetable.status.in_(["active", "old"]))
            .order_by(Timetable.id.desc()).all())
    return [{"id": t.id, "name": t.name, "current": t.status == "active",
             "created_at": t.created_at.isoformat()} for t in rows]


@router.get("/timetables/{tid}")
def get_timetable(tid: int, db: Session = Depends(get_db)):
    t = db.get(Timetable, tid)
    if not t:
        raise HTTPException(404, "Timetable not found")
    sec = db.get(Section, t.section_id) if t.section_id else None
    rows = (db.query(TimetableEntry, Course, Section, Degree, Room, Teacher)
            .join(SectionCourse, SectionCourse.id == TimetableEntry.section_course_id)
            .join(Course, Course.id == SectionCourse.course_id)
            .join(Section, Section.id == SectionCourse.section_id)
            .join(Degree, Degree.id == Section.degree_id)
            .join(Room, Room.id == TimetableEntry.room_id)
            .outerjoin(Teacher, Teacher.id == SectionCourse.teacher_id)
            .filter(TimetableEntry.timetable_id == tid).all())
    secs = {}
    for e, c, s, deg, room, teacher in rows:
        item = secs.setdefault(s.id, {"id": s.id,
                                      "label": f"{deg.name} - Section {s.name}",
                                      "entries": []})
        item["entries"].append({
            "day": e.day, "start": e.start_time.hour, "end": e.end_time.hour,
            "code": c.code, "course": c.name, "type": c.type,
            "teacher": teacher.name if teacher else "TBA", "room": room.name})
    return {"id": t.id, "name": t.name, "session_id": t.session_id,
            "section_id": t.section_id,
            "degree_id": sec.degree_id if sec else None,
            "settings": json.loads(t.settings or "{}"),
            "sections": sorted(secs.values(), key=lambda x: x["label"])}
@router.put("/timetables/{tid}")
def rename_timetable(tid: int, data: dict, db: Session = Depends(get_db)):
    t = db.get(Timetable, tid)
    if not t:
        raise HTTPException(404, "Timetable not found")
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")
    t.name = name
    db.commit()
    return {"id": t.id, "name": t.name}


@router.delete("/timetables/{tid}")
def delete_timetable(tid: int, db: Session = Depends(get_db)):
    t = db.get(Timetable, tid)
    if not t:
        raise HTTPException(404, "Timetable not found")
    t.status = "archived"          # permanent delete nahi, archive
    t.archived_at = datetime.utcnow()
    db.commit()
    return {"deleted": tid}