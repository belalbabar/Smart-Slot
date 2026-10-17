from datetime import datetime
from sqlalchemy import (Column, Integer, String, Boolean, DateTime,
                        ForeignKey, Time)
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="admin")  


class AcademicSession(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)  # Fall 2026
    status = Column(String, default="active")
    archived_at = Column(DateTime, nullable=True)


class Degree(Base):
    __tablename__ = "degrees"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # CE, CS, Cyber Security


class Section(Base):
    __tablename__ = "sections"
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    degree_id = Column(Integer, ForeignKey("degrees.id"))
    batch = Column(String, nullable=False)  # Fall 2024
    name = Column(String, nullable=False)   # A / B
    status = Column(String, default="active")
    archived_at = Column(DateTime, nullable=True)


class Teacher(Base):
    __tablename__ = "teachers"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # lab / theory
    credit_hours = Column(Integer, nullable=False)
    weekly_pattern = Column(String, nullable=False)  # "3" or "2+1" or "lab3"
    lab_kind = Column(String, nullable=True)  # hardware / software


class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # lab / theory
    capacity = Column(Integer, nullable=True)
    lab_kind = Column(String, nullable=True)  # hardware / software


class SectionCourse(Base):
    __tablename__ = "section_courses"
    id = Column(Integer, primary_key=True)
    section_id = Column(Integer, ForeignKey("sections.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    teacher_id = Column(Integer, ForeignKey("teachers.id"))


class Timetable(Base):
    __tablename__ = "timetables"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")
    archived_at = Column(DateTime, nullable=True)


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"
    id = Column(Integer, primary_key=True)
    timetable_id = Column(Integer, ForeignKey("timetables.id"))
    section_course_id = Column(Integer, ForeignKey("section_courses.id"))
    room_id = Column(Integer, ForeignKey("rooms.id"))
    day = Column(String, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)


class TeacherUnavailability(Base):
    __tablename__ = "teacher_unavailability"
    id = Column(Integer, primary_key=True)
    timetable_id = Column(Integer, ForeignKey("timetables.id"))
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    day = Column(String, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
class SessionDegree(Base):
    __tablename__ = "session_degrees"
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    degree_id = Column(Integer, ForeignKey("degrees.id"))