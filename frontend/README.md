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
```

## HOD and timetable accounts

The HOD can create a Timetable account in Manage Users, either linked to a teacher profile or with a standalone display name for a timetable coordinator. The person signs in at the regular login page with the username and initial password supplied by the HOD. Timetable accounts can view Rooms & Labs and room schedules; only HOD accounts can add, edit, or delete rooms.

Users can edit section names and change theory weekly patterns per section. Permanently deleting a section or archived session requires admin credentials. Timetable history can be renamed, archived, and exported as Excel, PNG, or PDF. Timetable classes can be dragged to another slot; the backend rejects room, teacher, section, and unavailability clashes. Undo reverses the last move, and Original restores the schedule from before manual edits. Teacher profiles support optional email and phone details.
