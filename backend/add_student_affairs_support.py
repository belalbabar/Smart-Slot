from sqlalchemy import text

from database import engine


with engine.begin() as connection:
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS student_affairs_tasks (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER NOT NULL REFERENCES teachers(id),
            title VARCHAR(160) NOT NULL,
            complaint_details TEXT NOT NULL,
            student_name VARCHAR(120) NOT NULL,
            roll_number VARCHAR(80) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            due_date DATE NOT NULL,
            completed_at TIMESTAMP NULL,
            resolution_note VARCHAR(500) NULL,
            escalated BOOLEAN NOT NULL DEFAULT FALSE,
            escalated_at TIMESTAMP NULL,
            deleted_at TIMESTAMP NULL
        )
    """))
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS student_affairs_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES student_affairs_tasks(id),
            kind VARCHAR(30) NOT NULL,
            message VARCHAR(500) NOT NULL,
            is_red BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMP NULL
        )
    """))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_student_affairs_tasks_teacher_id "
        "ON student_affairs_tasks (teacher_id)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_student_affairs_tasks_due_date "
        "ON student_affairs_tasks (due_date)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_student_affairs_tasks_status "
        "ON student_affairs_tasks (status)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_student_affairs_notifications_user_read "
        "ON student_affairs_notifications (user_id, read_at)"
    ))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_student_affairs_notifications_task_id "
        "ON student_affairs_notifications (task_id)"
    ))

print("Student Affairs schema is ready")
