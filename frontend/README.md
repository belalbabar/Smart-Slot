# SmartSlot

SmartSlot is a timetable management app with a FastAPI backend and React/Vite frontend.

## Run locally

Start the backend from `backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

Start the frontend in another terminal from `frontend`:

```powershell
npm run dev
```

The backend's database URL and JWT secret are configured in the local environment; do not add those values to this file or source control.

## Existing database updates

After deploying schema changes to an existing database, run each migration once from `backend`:

```powershell
.\venv\Scripts\python.exe .\add_user_teacher_column.py
.\venv\Scripts\python.exe .\add_section_course_pattern.py
.\venv\Scripts\python.exe .\add_user_display_name.py
.\venv\Scripts\python.exe .\add_teacher_phone.py
.\venv\Scripts\python.exe .\add_password_reset_support.py
.\venv\Scripts\python.exe .\add_student_affairs_support.py
```

## Account roles and module access

The HOD can create a Timetable account in Manage Users, either linked to a teacher profile or with a standalone display name for a timetable coordinator. The person signs in at the regular login page with the username and initial password supplied by the HOD. Timetable accounts can view Rooms & Labs and room schedules; only HOD accounts can add, edit, or delete rooms.

An authenticated HOD opens the Admin Panel without entering credentials a second time. For HOD accounts, Rooms & Labs is listed in the Timetable module; Timetable accounts continue to find Rooms & Labs in their Admin Panel.

The HOD can also create a **Student Affairs** account from Manage Users and must link it to a teacher profile; that profile is recorded as the task creator. Add the profile first in Teacher Dashboard if it is not listed. The account opens directly into Student Affairs, can create tasks for its linked teacher and view/manage all department tasks, and does not get timetable navigation or other HOD modules.

Users can edit section names and change theory weekly patterns per section. Permanently deleting a section or archived session requires admin credentials. Timetable history can be renamed, archived, and exported as Excel, PNG, or PDF. Timetable classes can be dragged to another slot; the backend rejects room, teacher, section, and unavailability clashes. Undo reverses the last move, and Original restores the schedule from before manual edits. Teacher profiles support optional email and phone details.

## Password reset email

Back up the database, then run `add_password_reset_support.py` once against an
existing database. Add a valid email to every login account from **Manage
Users**; reset requests require both the username and that account email.

Configure these variables privately in the backend environment (never in
frontend source control):

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM_EMAIL=...
SMTP_USE_TLS=true
SMTP_USE_SSL=false
FRONTEND_URL=https://your-smartslot-site.example
```

For local development, set `FRONTEND_URL=http://localhost:5173`. With a Gmail
mailbox, use a Google App Password as `SMTP_PASSWORD` rather than the mailbox
login password. Reset links are single-use and expire after 2 minutes.

## Student Affairs

Run `add_student_affairs_support.py` once against an existing database. Link
each teacher login to the matching teacher profile in **Manage Users**. A
teacher can create complaint tasks for students; each task is due 14 days
after creation. Overdue open tasks are escalated the next time a task list or
notifications are opened—there is no background timer. HODs and Student
Affairs accounts can view all tasks, notify teachers, extend escalated
deadlines, or resolve tasks. Removing a task only soft-deletes it.
