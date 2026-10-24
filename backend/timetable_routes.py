import json
from datetime import time, datetime, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ortools.sat.python import cp_model
from sqlalchemy import or_

from database import get_db
from auth import get_current_timetable_user
from models import (AcademicSession, Section, SectionCourse, Course, Teacher,
                    Room, Degree, Timetable, TimetableEntry,
                    TeacherUnavailability, User)

router = APIRouter(dependencies=[Depends(get_current_timetable_user)])

ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


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
    effective_from = data.get("effective_from") or None
    if effective_from:
        try:
            date.fromisoformat(effective_from)
        except (TypeError, ValueError):
            raise HTTPException(400, "effective_from must be a valid date")
    semester = data.get("semester") or None
    if semester is not None:
        try:
            semester = int(semester)
        except (TypeError, ValueError):
            raise HTTPException(400, "semester must be a number")
        if not 1 <= semester <= 12:
            raise HTTPException(400, "semester must be between 1 and 12")
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
    morning_by_day = {d: [] for d in days}
    afternoon_by_day = {d: [] for d in days}
    morning, afternoon = [], []

    for sc, c in items:
        cand_rooms = lab_rooms(c.lab_kind) if c.type == "lab" else theory_rooms
        if not cand_rooms:
            what = f"{c.lab_kind} lab" if c.type == "lab" else "theory room"
            raise HTTPException(400, f"No {what} available for {c.code}. "
                                     f"Add it in Admin > Rooms & Labs.")
        effective_pattern = sc.weekly_pattern or c.weekly_pattern
        if c.type == "lab":
            blocks = [3]
        else:
            try:
                blocks = [int(x) for x in effective_pattern.split("+")]
            except (AttributeError, ValueError):
                raise HTTPException(400, f"Invalid weekly pattern for {c.code}")
            if effective_pattern not in ("3", "2+1", "1+1+1", "2", "1"):
                raise HTTPException(400, f"Invalid weekly pattern for {c.code}")
        for length in blocks:
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
                        if s < ls:
                            morning.append(length * v)
                            morning_by_day[day].append(length * v)
                        else:
                            afternoon.append(length * v)
                            afternoon_by_day[day].append(length * v)
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

    # Balance class-hours across days and on both sides of lunch.
    max_day = model.NewIntVar(0, len(hours), "max_day")
    for d in days:
        model.Add(sum(day_load[d]) <= max_day)
    diff = model.NewIntVar(0, 200, "diff")
    model.Add(sum(morning) - sum(afternoon) <= diff)
    model.Add(sum(afternoon) - sum(morning) <= diff)
    daily_diffs = []
    missing_periods = []
    for d in days:
        morning_present = model.NewBoolVar(f"morning_{d}")
        afternoon_present = model.NewBoolVar(f"afternoon_{d}")
        model.Add(sum(morning_by_day[d]) >= morning_present)
        model.Add(sum(morning_by_day[d]) <= len(hours) * morning_present)
        model.Add(sum(afternoon_by_day[d]) >= afternoon_present)
        model.Add(sum(afternoon_by_day[d]) <= len(hours) * afternoon_present)
        missing_periods.extend((1 - morning_present, 1 - afternoon_present))

        daily_diff = model.NewIntVar(0, len(hours), f"period_diff_{d}")
        model.Add(sum(morning_by_day[d]) - sum(afternoon_by_day[d]) <= daily_diff)
        model.Add(sum(afternoon_by_day[d]) - sum(morning_by_day[d]) <= daily_diff)
        daily_diffs.append(daily_diff)
    model.Minimize(
        1000 * sum(missing_periods) + 40 * sum(daily_diffs)
        + 10 * max_day + 5 * diff
    )
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
                       "lunch_start": ls, "lunch_end": le,
                       "effective_from": effective_from,
                       "semester": semester}))
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
    db.flush()
    settings = json.loads(tt.settings)
    settings["original_entries"] = [
        {"entry_id": entry.id, "day": entry.day,
         "start": entry.start_time.hour, "room_id": entry.room_id}
        for entry in db.query(TimetableEntry)
        .filter_by(timetable_id=tt.id).order_by(TimetableEntry.id).all()
    ]
    tt.settings = json.dumps(settings)
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
    session = db.get(AcademicSession, t.session_id)
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
                                      "degree_name": deg.name,
                                      "section_name": s.name,
                                      "batch": s.batch,
                                      "entries": []})
        item["entries"].append({
            "entry_id": e.id,
            "day": e.day, "start": e.start_time.hour, "end": e.end_time.hour,
            "code": c.code, "course": c.name, "type": c.type,
            "room_id": room.id,
            "teacher": teacher.name if teacher else "TBA", "room": room.name})
    settings = json.loads(t.settings or "{}")
    if "original_entries" not in settings and rows:
        settings["original_entries"] = [
            {"entry_id": entry.id, "day": entry.day,
             "start": entry.start_time.hour, "room_id": entry.room_id}
            for entry, *_ in rows
        ]
        t.settings = json.dumps(settings)
        db.commit()
    return {"id": t.id, "name": t.name, "session_id": t.session_id,
            "session_name": session.name if session else "",
            "section_id": t.section_id,
            "degree_id": sec.degree_id if sec else None,
            "settings": settings,
            "sections": sorted(secs.values(), key=lambda x: x["label"])}


@router.get("/rooms/{room_id}/schedule")
def room_schedule(room_id: int, db: Session = Depends(get_db),
                  admin: User = Depends(get_current_timetable_user)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Room not found")

    rows = (db.query(TimetableEntry, Course, Section, Degree, Timetable, Teacher)
            .join(Timetable, Timetable.id == TimetableEntry.timetable_id)
            .join(SectionCourse, SectionCourse.id == TimetableEntry.section_course_id)
            .join(Course, Course.id == SectionCourse.course_id)
            .join(Section, Section.id == SectionCourse.section_id)
            .join(Degree, Degree.id == Section.degree_id)
            .outerjoin(Teacher, Teacher.id == SectionCourse.teacher_id)
            .filter(TimetableEntry.room_id == room_id,
                    Timetable.status == "active",
                    Section.status == "active")
            .order_by(TimetableEntry.day, TimetableEntry.start_time).all())

    schedules = []
    starts, ends = [], []
    for entry, course, section, degree, timetable, teacher in rows:
        settings = json.loads(timetable.settings or "{}")
        if "day_start" in settings:
            starts.append(int(settings["day_start"]))
        if "day_end" in settings:
            ends.append(int(settings["day_end"]))
        schedules.append({
            "day": entry.day,
            "start": entry.start_time.hour,
            "end": entry.end_time.hour,
            "course_code": course.code,
            "course_name": course.name,
            "section": f"{degree.name} - Section {section.name}",
            "teacher": teacher.name if teacher else "TBA",
        })

    return {
        "room": {"id": room.id, "name": room.name, "type": room.type,
                 "lab_kind": room.lab_kind},
        "day_start": min(starts, default=8),
        "day_end": max(ends, default=17),
        "days": ALL_DAYS,
        "entries": schedules,
    }
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


def entry_conflicts(db, timetable, entry, day, start, end, room_id,
                    exclude_current_timetable=False):
    section_course = db.get(SectionCourse, entry.section_course_id)
    query = (db.query(TimetableEntry, SectionCourse, Course, Section, Degree, Room,
                      Timetable)
             .join(Timetable, Timetable.id == TimetableEntry.timetable_id)
             .join(SectionCourse, SectionCourse.id == TimetableEntry.section_course_id)
             .join(Course, Course.id == SectionCourse.course_id)
             .join(Section, Section.id == SectionCourse.section_id)
             .join(Degree, Degree.id == Section.degree_id)
             .join(Room, Room.id == TimetableEntry.room_id)
             .filter(
                 TimetableEntry.day == day,
                 TimetableEntry.id != entry.id,
                 or_(Timetable.id == timetable.id,
                     Timetable.status == "active"),
                 Section.status == "active",
             ))
    if exclude_current_timetable:
        query = query.filter(Timetable.id != timetable.id)
    conflicts = []
    for other, other_sc, other_course, other_section, other_degree, other_room, other_tt in query:
        if other_tt.id != timetable.id and other_section.id == timetable.section_id:
            continue
        other_start = other.start_time.hour
        other_end = other.end_time.hour
        if start >= other_end or other_start >= end:
            continue
        if other_section.id == timetable.section_id:
            reason = f"{other_degree.name}-{other_section.name} section is occupied"
        elif room_id == other.room_id:
            reason = f"Room {other_room.name} is occupied by {other_degree.name}-{other_section.name}"
        elif section_course.teacher_id and other_sc.teacher_id == section_course.teacher_id:
            teacher = db.get(Teacher, section_course.teacher_id)
            reason = f"{teacher.name if teacher else 'Teacher'} is teaching {other_degree.name}-{other_section.name}"
        else:
            continue
        conflicts.append(
            f"{reason} at {day} {other_start}:00-{other_end}:00 "
            f"({other_course.code} {other_course.name})"
        )
    return conflicts


@router.put("/timetables/{tid}/entries/{entry_id}")
def move_timetable_entry(tid: int, entry_id: int, data: dict,
                         db: Session = Depends(get_db)):
    timetable = db.get(Timetable, tid)
    entry = db.get(TimetableEntry, entry_id)
    if not timetable or not entry or entry.timetable_id != tid:
        raise HTTPException(404, "Timetable entry not found")
    section_course = db.get(SectionCourse, entry.section_course_id)
    if not section_course:
        raise HTTPException(404, "Course assignment not found")
    settings = json.loads(timetable.settings or "{}")
    day = data.get("day")
    if day not in settings.get("days", []):
        raise HTTPException(400, "Choose a working day")
    try:
        start = int(data.get("start"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Start time must be an hour number")
    duration = entry.end_time.hour - entry.start_time.hour
    end = start + duration
    day_start = int(settings.get("day_start", 8))
    day_end = int(settings.get("day_end", 17))
    lunch_start = int(settings.get("lunch_start", 12))
    lunch_end = int(settings.get("lunch_end", 13))
    if start < day_start or end > day_end or start >= end:
        raise HTTPException(400, "Drop the class inside the timetable hours")
    if start < lunch_end and end > lunch_start:
        raise HTTPException(400, "Classes cannot overlap the lunch break")

    if section_course.teacher_id and db.query(TeacherUnavailability).filter_by(
            timetable_id=tid, teacher_id=section_course.teacher_id, day=day
    ).first():
        teacher = db.get(Teacher, section_course.teacher_id)
        raise HTTPException(
            409,
            detail=f"Clash: {teacher.name if teacher else 'Teacher'} is unavailable on {day}",
        )

    conflicts = entry_conflicts(
        db, timetable, entry, day, start, end, entry.room_id
    )
    if conflicts:
        raise HTTPException(409, detail="Clash: " + "; ".join(conflicts))

    if "original_entries" not in settings:
        settings["original_entries"] = [
            {"entry_id": row.id, "day": row.day, "start": row.start_time.hour,
             "room_id": row.room_id}
            for row in db.query(TimetableEntry)
            .filter_by(timetable_id=tid).order_by(TimetableEntry.id).all()
        ]
    entry.day = day
    entry.start_time = time(start)
    entry.end_time = time(end)
    timetable.settings = json.dumps(settings)
    db.commit()
    return {"id": entry.id, "day": entry.day, "start": start, "end": end}


@router.post("/timetables/{tid}/restore-original")
def restore_original_timetable(tid: int, db: Session = Depends(get_db)):
    timetable = db.get(Timetable, tid)
    if not timetable:
        raise HTTPException(404, "Timetable not found")
    settings = json.loads(timetable.settings or "{}")
    original = settings.get("original_entries")
    if not original:
        raise HTTPException(400, "This timetable has no saved original schedule")

    entries = {row.id: row for row in db.query(TimetableEntry)
               .filter_by(timetable_id=tid).all()}
    if {row["entry_id"] for row in original} != set(entries):
        raise HTTPException(409, "The saved original no longer matches this timetable")
    for saved in original:
        entry = entries[saved["entry_id"]]
        duration = entry.end_time.hour - entry.start_time.hour
        conflicts = entry_conflicts(
            db, timetable, entry, saved["day"], saved["start"],
            saved["start"] + duration, saved["room_id"],
            exclude_current_timetable=True
        )
        if conflicts:
            raise HTTPException(409, detail="Clash restoring original: " + "; ".join(conflicts))

    for saved in original:
        entry = entries[saved["entry_id"]]
        duration = entry.end_time.hour - entry.start_time.hour
        entry.day = saved["day"]
        entry.start_time = time(saved["start"])
        entry.end_time = time(saved["start"] + duration)
        entry.room_id = saved["room_id"]
    db.commit()
    return {"restored": True}