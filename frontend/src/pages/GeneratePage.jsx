import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import TimetableDownloadMenu from "../TimetableDownloadMenu";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function GeneratePage() {
  const { id, degreeId, sectionId } = useParams();
  const navigate = useNavigate();
  const [days, setDays] = useState(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [dayStart, setDayStart] = useState(8);
  const [dayEnd, setDayEnd] = useState(16);
  const [lunchStart, setLunchStart] = useState(12);
  const [lunchEnd, setLunchEnd] = useState(13);
  const [semester, setSemester] = useState("5");
  const [name, setName] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [unav, setUnav] = useState([]);
  const [pickTeacher, setPickTeacher] = useState("");
  const [pickDays, setPickDays] = useState([]);
  const [old, setOld] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);

  const loadOld = () =>
    api(`/sections/${sectionId}/timetables`).then(setOld).catch(() => {});

  useEffect(() => {
    api("/teachers").then(setTeachers).catch(() => {});
    loadOld();
  }, [sectionId]);

  async function renameTt(t) {
    setMenu(null);
    const n = window.prompt("New name:", t.name);
    if (!n || !n.trim()) return;
    try {
      await api(`/timetables/${t.id}`, { method: "PUT", body: JSON.stringify({ name: n }) });
      loadOld();
    } catch (e) { setError(e.message); }
  }

  async function deleteTt(t) {
    setMenu(null);
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await api(`/timetables/${t.id}`, { method: "DELETE" });
      loadOld();
    } catch (e) { setError(e.message); }
  }

  const toggle = (list, setList, d) =>
    setList(list.includes(d) ? list.filter((x) => x !== d) : [...list, d]);

  function addUnav() {
    if (!pickTeacher || pickDays.length === 0) return;
    setUnav([...unav.filter((u) => u.teacher_id !== pickTeacher),
      { teacher_id: pickTeacher, days: pickDays }]);
    setPickTeacher("");
    setPickDays([]);
  }

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const res = await api(`/sections/${sectionId}/generate`, {
        method: "POST",
        body: JSON.stringify({
          name, days, day_start: Number(dayStart), day_end: Number(dayEnd),
          lunch_start: Number(lunchStart), lunch_end: Number(lunchEnd),
          semester: semester.trim(),
          unavailable: unav.map((u) => ({ teacher_id: Number(u.teacher_id), days: u.days })),
        }),
      });
      navigate(`/timetables/${res.id}`, { state: { warnings: res.warnings, secs: res.solve_seconds } });
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const tname = (tid) => teachers.find((t) => String(t.id) === String(tid))?.name || tid;

  return (
    <div>
      <p className="crumb">
        <Link to={`/sessions/${id}/degrees/${degreeId}/sections/${sectionId}`}>Back to section</Link>
      </p>
      <h2>Generate Timetable</h2>

      <div className="panel">
        <h3>Working days (untick the off days)</h3>
        <div className="checks">
          {DAYS.map((d) => (
            <label key={d}><input type="checkbox" checked={days.includes(d)}
              onChange={() => toggle(days, setDays, d)} /> {d}</label>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Timings</h3>
        <div className="row">
          <label>Start <input type="number" value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></label>
          <label>End <input type="number" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></label>
          <label>Break from <input type="number" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} /></label>
          <label>Break to <input type="number" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} /></label>
        </div>
      </div>

      <div className="panel">
        <h3>Timetable heading</h3>
        <div className="row">
          <label>Semester <input type="number" min="1" max="12" value={semester}
            onChange={(e) => setSemester(e.target.value)} /></label>
        </div>
      </div>

      <div className="panel">
        <h3>Teacher unavailable (optional)</h3>
        <div className="row">
          <select value={pickTeacher} onChange={(e) => setPickTeacher(e.target.value)}>
            <option value="">Select teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="checks">
            {DAYS.map((d) => (
              <label key={d}><input type="checkbox" checked={pickDays.includes(d)}
                onChange={() => toggle(pickDays, setPickDays, d)} /> {d.slice(0, 3)}</label>
            ))}
          </div>
          <button type="button" onClick={addUnav}>Add</button>
        </div>
        {unav.map((u) => (
          <p key={u.teacher_id} className="muted">
            {tname(u.teacher_id)}: {u.days.join(", ")}{" "}
            <button type="button" className="grey"
              onClick={() => setUnav(unav.filter((x) => x !== u))}>Remove</button>
          </p>
        ))}
      </div>

      <p className="muted">
        Other sections' rooms, labs and teacher timings are automatically avoided.
      </p>
      <div className="row">
        <input placeholder="Timetable name (optional)" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button onClick={generate} disabled={busy}>
          {busy ? "Generating..." : "Generate"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {old.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Previous timetables of this section</h3>
          <table className="hist">
            <tbody>
              {old.map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/timetables/${t.id}`}>{t.name}</Link></td>
                  <td>{t.created_at.slice(0, 16).replace("T", " ")}</td>
                  <td style={{ width: 50 }}>
                    <div className="dots-wrap">
                      <button type="button" className="dots-btn"
                        onClick={() => setMenu(menu === t.id ? null : t.id)}>⋮</button>
                      {menu === t.id && (
                        <div className="dots-menu">
                          <button type="button" onClick={() => renameTt(t)}>Rename</button>
                          <button type="button" className="del" onClick={() => deleteTt(t)}>Delete</button>
                          <TimetableDownloadMenu timetableId={t.id} />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}