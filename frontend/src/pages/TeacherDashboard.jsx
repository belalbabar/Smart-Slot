import { useEffect, useState } from "react";
import { api } from "../api";

export default function TeacherDashboard() {
  const [rows, setRows] = useState([]);
  const [selId, setSelId] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setRows(await api("/teacher-workload"));
  }
  useEffect(() => { load(); }, []);

  async function guard(fn) {
    setError("");
    try { await fn(); await load(); } catch (e) { setError(e.message); }
  }

  const add = (e) => {
    e.preventDefault();
    guard(async () => {
      await api("/teachers", { method: "POST", body: JSON.stringify({ name, email }) });
      setName(""); setEmail("");
    });
  };
  const rename = (t) => {
    const n = window.prompt("Teacher name:", t.name);
    if (!n) return;
    guard(() => api(`/teachers/${t.id}`, {
      method: "PUT", body: JSON.stringify({ name: n, email: t.email || "" }),
    }));
  };
  const remove = (t) =>
    window.confirm(`Delete ${t.name}?`) &&
    guard(() => api(`/teachers/${t.id}`, { method: "DELETE" }));

  const sel = rows.find((r) => r.id === selId);

  return (
    <div>
      <h2>Teacher Dashboard</h2>
      <form className="row" onSubmit={add}>
        <input placeholder="Teacher name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <input placeholder="Email (optional)" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <button type="submit">Add Teacher</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr><th>Teacher</th><th>Courses</th><th>Weekly hours</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <a href="#" onClick={(e) => { e.preventDefault(); setSelId(t.id); }}>
                  {t.name}
                </a>
              </td>
              <td>{t.course_count}</td>
              <td>{t.weekly_hours}</td>
              <td>
                <button onClick={() => rename(t)}>Rename</button>{" "}
                <button className="danger" onClick={() => remove(t)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
        <div className="panel">
          <h3>{sel.name}: {sel.weekly_hours} hours / week</h3>
          {sel.classes.length === 0 ? <p className="muted">No courses assigned yet.</p> : (
            <table>
              <thead>
                <tr><th>Session</th><th>Degree</th><th>Section</th><th>Course</th>
                  <th>Type</th><th>Hours</th></tr>
              </thead>
              <tbody>
                {sel.classes.map((c, i) => (
                  <tr key={i}>
                    <td>{c.session}</td><td>{c.degree}</td><td>{c.section}</td>
                    <td>{c.code} {c.name}</td><td>{c.type}</td><td>{c.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}