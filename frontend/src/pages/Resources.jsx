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

  const hours = Array.from(
    { length: schedule.day_end - schedule.day_start },
    (_, index) => schedule.day_start + index
  );

  return (
    <div className="panel">
      <h3>{schedule.room.name} schedule</h3>
      <p className="muted">
        {schedule.room.type === "lab" ? `${schedule.room.lab_kind} lab` : "Theory room"}
        {" · "}Current active timetables
      </p>
      <div className="room-schedule-scroll">
      <table className="room-schedule-grid">
        <thead>
          <tr>
            <th>Day</th>
            {hours.map((hour) => (
              <th key={hour}>{formatHour(hour)} - {formatHour(hour + 1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const cells = [];
            for (let index = 0; index < hours.length;) {
              const hour = hours[index];
                const entries = schedule.entries.filter((entry) =>
                  entry.day === day && entry.start <= hour && entry.end > hour
                );
                if (!entries.length) {
                  let freeHours = 0;
                  for (let next = index; next < hours.length; next += 1) {
                    const nextHour = hours[next];
                    const occupied = schedule.entries.some((entry) =>
                      entry.day === day && entry.start <= nextHour && entry.end > nextHour
                    );
                    if (occupied) break;
                    freeHours += 1;
                  }
                  cells.push(
                    <td key={hour} colSpan={freeHours}
                      className="room-hour free">
                      <span className="room-status free">Free</span>
                    </td>
                  );
                  index += freeHours;
                  continue;
                }
                cells.push(
                  <td key={hour} className="room-hour occupied"
                    title={entries.map((entry) =>
                      `${entry.course_code} ${entry.course_name} · ${entry.section} · ${entry.teacher}`
                    ).join("\n") || `${day}: Free`}>
                    {entries.map((entry) => (
                      <div key={`${entry.course_code}-${entry.start}`} className="room-class">
                        <span className="room-status occupied">Occupied</span>
                        <strong>{entry.course_code}</strong>
                        <span>{entry.section}</span>
                        <span>{entry.teacher}</span>
                      </div>
                    ))}
                  </td>
                );
                index += 1;
            }
            return (
              <tr key={day}>
                <th scope="row">{day}</th>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export const Rooms = () => {
  const [selected, setSelected] = useState(null);
  const role = localStorage.getItem("role");
  const readOnly = !["admin", "hod"].includes(role);
  return (
    <>
      <CrudPage title="Rooms & Labs" path="rooms" selectedId={selected?.id}
        onSelect={setSelected} readOnly={readOnly}
        fields={[
          { key: "name", label: "Room name" },
          { key: "type", label: "Type", options: ["theory", "lab"] },
          { key: "lab_kind", label: "Lab kind", options: ["hardware", "software"] },
        ]} />
      {selected && <RoomSchedule key={selected.id} roomId={selected.id} />}
    </>
  );
};