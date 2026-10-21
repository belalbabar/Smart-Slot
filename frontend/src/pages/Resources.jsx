import { useEffect, useState } from "react";
import CrudPage from "../CrudPage";
import { api } from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHour(hour) {
  const value = hour % 12 || 12;
  return `${value}:00 ${hour < 12 ? "AM" : "PM"}`;
}

function RoomSchedule({ roomId }) {
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api(`/rooms/${roomId}/schedule`).then((data) => {
      if (active) setSchedule(data);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [roomId]);

  if (error) return <p className="error">{error}</p>;
  if (!schedule) return <p className="muted">Loading room schedule...</p>;

  const rows = DAYS.flatMap((day) => {
    const entries = schedule.entries
      .filter((entry) => entry.day === day)
      .sort((a, b) => a.start - b.start);
    const dayRows = [];
    let cursor = schedule.day_start;
    for (const entry of entries) {
      if (entry.start > cursor) {
        dayRows.push({
          day, start: cursor, end: entry.start, status: "Free",
        });
      }
      dayRows.push({ ...entry, status: "Occupied" });
      cursor = Math.max(cursor, entry.end);
    }
    if (cursor < schedule.day_end) {
      dayRows.push({
        day, start: cursor, end: schedule.day_end, status: "Free",
      });
    }
    if (dayRows.length === 0) {
      dayRows.push({
        day, start: schedule.day_start, end: schedule.day_end, status: "Free",
      });
    }
    return dayRows;
  });

  return (
    <div className="panel">
      <h3>{schedule.room.name} schedule</h3>
      <p className="muted">
        {schedule.room.type === "lab" ? `${schedule.room.lab_kind} lab` : "Theory room"}
        {" · "}Current active timetables
      </p>
      <table>
        <thead>
          <tr><th>Day</th><th>Time</th><th>Status</th><th>Class details</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.day}-${row.start}-${index}`}>
              <td>{row.day}</td>
              <td>{formatHour(row.start)} - {formatHour(row.end)}</td>
              <td>
                <span className={`room-status ${row.status.toLowerCase()}`}>
                  {row.status}
                </span>
              </td>
              <td>{row.status === "Occupied"
                ? `${row.course_code} ${row.course_name} · ${row.section} · ${row.teacher}`
                : "No class scheduled"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Rooms = () => {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <CrudPage title="Rooms & Labs" path="rooms" selectedId={selected?.id}
        onSelect={setSelected}
        fields={[
          { key: "name", label: "Room name" },
          { key: "type", label: "Type", options: ["theory", "lab"] },
          { key: "lab_kind", label: "Lab kind", options: ["hardware", "software"] },
        ]} />
      {selected && <RoomSchedule key={selected.id} roomId={selected.id} />}
    </>
  );
};