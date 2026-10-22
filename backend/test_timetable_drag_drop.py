import json
import unittest
from datetime import time

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from auth import hash_password
from database import Base
from models import (
    AcademicSession,
    Course,
    Degree,
    Room,
    Section,
    SectionCourse,
    Timetable,
    TimetableEntry,
    Teacher,
    SessionDegree,
    User,
)
from session_routes import import_courses, remove_degree
from timetable_routes import generate, move_timetable_entry


class TimetableDragDropTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        session = AcademicSession(name="Test session", status="active")
        degree = Degree(name="Test degree")
        teacher = Teacher(name="Test teacher")
        course = Course(
            code="TEST-101",
            name="Test course",
            type="theory",
            credit_hours=1,
            weekly_pattern="1",
        )
        room = Room(name="R1", type="theory")
        self.db.add_all([session, degree, teacher, course, room])
        self.db.flush()

        section = Section(
            session_id=session.id,
            degree_id=degree.id,
            batch=session.name,
            name="A",
            status="active",
        )
        self.db.add(section)
        self.db.flush()
        assignment = SectionCourse(
            section_id=section.id,
            course_id=course.id,
            teacher_id=teacher.id,
        )
        timetable = Timetable(
            name="Test timetable",
            session_id=session.id,
            section_id=section.id,
            status="active",
            settings=json.dumps({
                "days": ["Monday", "Tuesday"],
                "day_start": 8,
                "day_end": 17,
                "lunch_start": 12,
                "lunch_end": 13,
            }),
        )
        self.db.add_all([assignment, timetable])
        self.db.flush()
        self.entry = TimetableEntry(
            timetable_id=timetable.id,
            section_course_id=assignment.id,
            room_id=room.id,
            day="Monday",
            start_time=time(8),
            end_time=time(9),
        )
        self.db.add(self.entry)
        self.db.commit()
        self.timetable_id = timetable.id
        self.section_id = section.id

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_move_persists_target_and_original_schedule(self):
        result = move_timetable_entry(
            self.timetable_id,
            self.entry.id,
            {"day": "Tuesday", "start": 10},
            self.db,
        )

        self.db.refresh(self.entry)
        settings = json.loads(self.db.get(Timetable, self.timetable_id).settings)
        self.assertEqual(result, {
            "id": self.entry.id,
            "day": "Tuesday",
            "start": 10,
            "end": 11,
        })
        self.assertEqual(self.entry.day, "Tuesday")
        self.assertEqual(self.entry.start_time, time(10))
        self.assertEqual(settings["original_entries"], [{
            "entry_id": self.entry.id,
            "day": "Monday",
            "start": 8,
            "room_id": self.entry.room_id,
        }])

    def test_empty_degree_can_be_removed_after_hod_verification(self):
        session = self.db.query(AcademicSession).first()
        degree = Degree(name="Empty degree")
        admin = User(
            username="hod-test",
            password_hash=hash_password("test-password"),
            role="hod",
        )
        self.db.add_all([degree, admin])
        self.db.flush()
        link = SessionDegree(session_id=session.id, degree_id=degree.id)
        self.db.add(link)
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            remove_degree(
                session.id,
                degree.id,
                {"admin_username": "hod-test", "password": "wrong"},
                self.db,
            )
        self.assertEqual(error.exception.status_code, 403)

        result = remove_degree(
            session.id,
            degree.id,
            {"admin_username": "hod-test", "password": "test-password"},
            self.db,
        )
        self.assertEqual(result, {"deleted": degree.id})
        self.assertIsNone(
            self.db.query(SessionDegree).filter_by(
                session_id=session.id, degree_id=degree.id
            ).first()
        )

    def test_generation_balances_class_hours_across_lunch(self):
        section_course = self.db.query(SectionCourse).first()
        self.db.get(Course, section_course.course_id).weekly_pattern = "2+1"
        for index in range(3):
            course = Course(
                code=f"TEST-{index + 2:03}",
                name=f"Test course {index + 2}",
                type="theory",
                credit_hours=3,
                weekly_pattern="2+1",
            )
            self.db.add(course)
            self.db.flush()
            self.db.add(SectionCourse(
                section_id=section_course.section_id,
                course_id=course.id,
                teacher_id=section_course.teacher_id,
            ))
        self.db.commit()

        result = generate(section_course.section_id, {
            "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "day_start": 8,
            "day_end": 17,
            "lunch_start": 12,
            "lunch_end": 13,
        }, self.db)
        entries = self.db.query(TimetableEntry).filter_by(
            timetable_id=result["id"]
        ).all()
        morning_hours = sum(
            max(0, min(entry.end_time.hour, 12) - entry.start_time.hour)
            for entry in entries
        )
        afternoon_hours = sum(
            max(0, entry.end_time.hour - max(entry.start_time.hour, 13))
            for entry in entries
        )

        self.assertEqual(result["classes"], 8)
        self.assertEqual(sum(
            entry.end_time.hour - entry.start_time.hour for entry in entries
        ), 12)
        self.assertLessEqual(abs(morning_hours - afternoon_hours), 1)

    def test_excel_course_import_creates_assignments_with_teacher_and_pattern(self):
        result = import_courses(self.section_id, {"courses": [{
            "code": "TEST-202",
            "name": "Imported course",
            "type": "theory",
            "credit_hours": 3,
            "weekly_pattern": "2+1",
            "teacher": "Test teacher",
        }]}, self.db)

        self.assertEqual(result, {"imported": 1})
        course = self.db.query(Course).filter_by(code="TEST-202").one()
        assignment = self.db.query(SectionCourse).filter_by(
            section_id=self.section_id, course_id=course.id
        ).one()
        self.assertEqual(course.name, "Imported course")
        self.assertEqual(course.weekly_pattern, "2+1")
        self.assertEqual(assignment.teacher_id, self.db.query(Teacher).first().id)
        self.assertIsNone(assignment.weekly_pattern)

    def test_excel_course_import_rejects_entire_batch_for_unknown_teacher(self):
        with self.assertRaises(HTTPException) as error:
            import_courses(self.section_id, {"courses": [
                {
                    "code": "TEST-202",
                    "name": "Imported course",
                    "type": "theory",
                    "credit_hours": 3,
                    "weekly_pattern": "2+1",
                },
                {
                    "code": "TEST-203",
                    "name": "Another course",
                    "type": "theory",
                    "credit_hours": 3,
                    "weekly_pattern": "3",
                    "teacher": "Unknown teacher",
                },
            ]}, self.db)

        self.assertEqual(error.exception.status_code, 400)
        self.assertIsNone(self.db.query(Course).filter_by(code="TEST-202").first())


if __name__ == "__main__":
    unittest.main()
