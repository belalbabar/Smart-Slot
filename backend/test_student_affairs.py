import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from models import (
    StudentAffairsNotification,
    StudentAffairsTask,
    Teacher,
    User,
)
from student_affairs_routes import (
    DeadlineExtension,
    TaskComplete,
    TaskCreate,
    complete_task,
    create_task,
    extend_deadline,
    list_notifications,
    list_tasks,
    mark_notification_read,
    remind_teacher,
    soft_delete_task,
)


class StudentAffairsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.teacher = Teacher(name="Teacher One")
        self.other_teacher = Teacher(name="Teacher Two")
        self.db.add_all([self.teacher, self.other_teacher])
        self.db.flush()
        self.teacher_user = User(
            username="teacher-one",
            password_hash="unused",
            role="timetable",
            teacher_id=self.teacher.id,
        )
        self.other_teacher_user = User(
            username="teacher-two",
            password_hash="unused",
            role="timetable",
            teacher_id=self.other_teacher.id,
        )
        self.hod = User(
            username="hod",
            password_hash="unused",
            role="hod",
        )
        self.student_affairs_user = User(
            username="student-affairs",
            password_hash="unused",
            role="student_affairs",
            teacher_id=self.teacher.id,
        )
        self.db.add_all([
            self.teacher_user,
            self.other_teacher_user,
            self.hod,
            self.student_affairs_user,
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_teacher_task(self, user=None, title="Complaint follow-up"):
        return create_task(
            TaskCreate(
                title=title,
                complaint_details="Student reported a registration issue.",
                student_name="Student One",
                roll_number="CE-101",
            ),
            self.db,
            user or self.teacher_user,
        )

    def create_overdue_task(self):
        task = StudentAffairsTask(
            teacher_id=self.teacher.id,
            title="Overdue complaint",
            complaint_details="Needs follow-up.",
            student_name="Student One",
            roll_number="CE-101",
            due_date=datetime.utcnow().date() - timedelta(days=3),
        )
        self.db.add(task)
        self.db.commit()
        return task

    def test_task_gets_fourteen_day_deadline_and_teacher_ownership(self):
        self.create_teacher_task()
        self.create_teacher_task(self.other_teacher_user, "Other complaint")

        teacher_tasks = list_tasks("open", self.db, self.teacher_user)
        hod_tasks = list_tasks("open", self.db, self.hod)

        self.assertEqual(len(teacher_tasks), 1)
        self.assertEqual(teacher_tasks[0]["title"], "Complaint follow-up")
        created_date = datetime.fromisoformat(
            teacher_tasks[0]["created_at"]
        ).date()
        self.assertEqual(teacher_tasks[0]["due_date"], (
            created_date + timedelta(days=14)
        ).isoformat())
        self.assertEqual(len(hod_tasks), 2)

    def test_only_linked_teacher_can_create_tasks(self):
        with self.assertRaises(HTTPException) as error:
            self.create_teacher_task(self.hod)
        self.assertEqual(error.exception.status_code, 403)

    def test_student_affairs_role_can_view_and_manage_all_tasks(self):
        self.create_teacher_task()
        self.create_teacher_task(self.other_teacher_user, "Other complaint")

        rows = list_tasks("open", self.db, self.student_affairs_user)

        self.assertEqual(len(rows), 2)
        complete_task(
            rows[0]["id"],
            TaskComplete(resolution_note="Resolved by Student Affairs."),
            self.db,
            self.student_affairs_user,
        )
        self.assertEqual(
            list_tasks("completed", self.db, self.student_affairs_user)[0]["status"],
            "completed",
        )

    def test_linked_student_affairs_account_can_create_task_for_linked_teacher(self):
        result = self.create_teacher_task(self.student_affairs_user)

        self.assertEqual(result["teacher_id"], self.teacher.id)
        self.assertEqual(result["title"], "Complaint follow-up")
        self.assertEqual(result["status"], "open")

    def test_unlinked_student_affairs_account_cannot_create_task(self):
        unlinked_user = User(
            username="unlinked-student-affairs",
            password_hash="unused",
            role="student_affairs",
        )
        self.db.add(unlinked_user)
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            self.create_teacher_task(unlinked_user)

        self.assertEqual(error.exception.status_code, 400)

    def test_escalations_notify_student_affairs_role(self):
        task = self.create_overdue_task()

        result = list_notifications(self.db, self.student_affairs_user)

        self.assertTrue(result["items"][0]["is_red"])
        self.assertEqual(result["items"][0]["task_id"], task.id)

    def test_task_list_escalates_overdue_task_once_for_hod(self):
        task = self.create_overdue_task()

        rows = list_tasks("open", self.db, self.hod)
        list_notifications(self.db, self.hod)
        self.db.refresh(task)

        notices = self.db.query(StudentAffairsNotification).filter(
            StudentAffairsNotification.task_id == task.id,
            StudentAffairsNotification.user_id == self.hod.id,
        ).all()
        self.assertTrue(task.escalated)
        self.assertEqual(rows[0]["overdue_days"], 3)
        self.assertEqual(len(notices), 1)
        self.assertTrue(notices[0].is_red)
        self.assertEqual(
            list_notifications(self.db, self.hod)["unread_escalation_count"], 1
        )
        mark_notification_read(notices[0].id, self.db, self.hod)
        self.assertEqual(
            list_notifications(self.db, self.hod)["unread_escalation_count"], 0
        )

    def test_opening_notifications_also_escalates_tasks(self):
        task = self.create_overdue_task()

        result = list_notifications(self.db, self.hod)

        self.db.refresh(task)
        self.assertTrue(task.escalated)
        self.assertEqual(result["unread_count"], 1)
        self.assertTrue(result["items"][0]["is_red"])

    def test_hod_reminder_and_deadline_extension_notify_teacher(self):
        task = self.create_overdue_task()
        list_tasks("open", self.db, self.hod)

        reminder = remind_teacher(task.id, self.db, self.hod)
        extended = extend_deadline(
            task.id,
            DeadlineExtension(due_date=datetime.utcnow().date() + timedelta(days=5)),
            self.db,
            self.hod,
        )
        notices = self.db.query(StudentAffairsNotification).filter(
            StudentAffairsNotification.user_id == self.teacher_user.id,
            StudentAffairsNotification.task_id == task.id,
        ).order_by(StudentAffairsNotification.id).all()

        self.assertIn("Reminder sent", reminder["message"])
        self.assertEqual(extended["due_date"], (
            datetime.utcnow().date() + timedelta(days=5)
        ).isoformat())
        self.assertEqual([item.kind for item in notices], [
            "reminder", "deadline_extended",
        ])
        self.db.refresh(task)
        self.assertFalse(task.escalated)

    def test_completion_records_note_and_removes_task_from_open_list(self):
        task = self.create_overdue_task()
        list_tasks("open", self.db, self.hod)

        completed = complete_task(
            task.id,
            TaskComplete(resolution_note="Registration was corrected."),
            self.db,
            self.teacher_user,
        )
        open_tasks = list_tasks("open", self.db, self.teacher_user)
        completed_tasks = list_tasks("completed", self.db, self.teacher_user)
        self.db.refresh(task)
        escalation = self.db.query(StudentAffairsNotification).filter(
            StudentAffairsNotification.task_id == task.id,
            StudentAffairsNotification.user_id == self.hod.id,
        ).one()

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["resolution_note"], "Registration was corrected.")
        self.assertFalse(completed["escalated"])
        self.assertEqual(open_tasks, [])
        self.assertEqual(len(completed_tasks), 1)
        self.assertIsNotNone(escalation.read_at)

    def test_other_teacher_cannot_complete_or_remove_task(self):
        task = self.create_teacher_task()
        with self.assertRaises(HTTPException) as completion:
            complete_task(
                task["id"],
                TaskComplete(resolution_note="Resolved."),
                self.db,
                self.other_teacher_user,
            )
        with self.assertRaises(HTTPException) as deletion:
            soft_delete_task(task["id"], self.db, self.other_teacher_user)

        self.assertEqual(completion.exception.status_code, 403)
        self.assertEqual(deletion.exception.status_code, 403)

    def test_delete_is_soft_and_removed_task_is_hidden(self):
        task = self.create_teacher_task()

        result = soft_delete_task(task["id"], self.db, self.teacher_user)
        remaining = list_tasks("all", self.db, self.teacher_user)
        stored = self.db.get(StudentAffairsTask, task["id"])

        self.assertEqual(result, {"deleted": task["id"]})
        self.assertIsNotNone(stored.deleted_at)
        self.assertEqual(remaining, [])

    def test_cannot_extend_deadline_to_a_nonfuture_date(self):
        task = self.create_overdue_task()
        list_tasks("open", self.db, self.hod)

        with self.assertRaises(HTTPException) as error:
            extend_deadline(
                task.id,
                DeadlineExtension(due_date=datetime.utcnow().date()),
                self.db,
                self.hod,
            )
        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
