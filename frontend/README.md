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
```

## HOD and timetable accounts

The HOD can create a Timetable account in Manage Users, either linked to a teacher profile or with a standalone display name for a timetable coordinator. The person signs in at the regular login page with the username and initial password supplied by the HOD. Timetable accounts can manage schedules but do not have access to Rooms & Labs.

Users can edit section names and change theory weekly patterns per section. Permanently deleting a section requires the HOD username and password. Rooms & Labs includes schedules based on active timetables. Timetable downloads include a PDF grid and an Excel schedule.
