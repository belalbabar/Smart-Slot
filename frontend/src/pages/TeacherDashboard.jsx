import { useEffect, useState } from "react";
import { api } from "../api";

export default function TeacherDashboard() {
  const [rows, setRows] = useState([]);
  const [selId, setSelId] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editTeacher, setEditTeacher] = useState({ name: "", email: "", phone: "" });
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
      await api("/teachers", {
        method: "POST", body: JSON.stringify({ name, email, phone }),
      });
      setName(""); setEmail(""); setPhone("");
    });
  };
  const startEdit = (teacher) => {
    setEditId(teacher.id);
    setEditTeacher({
      name: teacher.name,
      email: teacher.email || "",
      phone: teacher.phone || "",
    });
  };
  const saveEdit = (e) => {
    e.preventDefault();
    guard(async () => {
      await api(`/teachers/${editId}`, {
        method: "PUT", body: JSON.stringify(editTeacher),
      });
      setEditId(null);
    });
  };
  const remove = (t) =>
    window.confirm(`Delete ${t.name}?`) &&
    guard(() => api(`/teachers/${t.id}`, { method: "DELETE" }));

  const sel = rows.find((r) => r.id === selId);
  const filteredRows = rows.filter((teacher) =>
    teacher.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div>
      <h2>Teacher Dashboard</h2>
      <form className="row" onSubmit={add}>
        <input placeholder="Teacher name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <input placeholder="Email (optional)" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Phone number (optional)" value={phone}
          onChange={(e) => setPhone(e.target.value)} />
        <button type="submit">Add Teacher</button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="row">
        <input type="search" placeholder="Search teachers by name"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted">
          {filteredRows.length} teacher{filteredRows.length === 1 ? "" : "s"}
        </span>
      </div>
      <table>
        <thead>
          <tr><th>Teacher</th><th>Courses</th><th>Weekly hours</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {filteredRows.map((t) => (
            <tr key={t.id}>
              {editId === t.id ? (
                <td colSpan={4}>
                  <form className="row course-edit" onSubmit={saveEdit}>
                    <input aria-label="Teacher name" required placeholder="Teacher name"
                      value={editTeacher.name}
                      onChange={(e) => setEditTeacher({ ...editTeacher, name: e.target.value })} />
                    <input aria-label="Teacher email" type="email" placeholder="Email (optional)"
                      value={editTeacher.email}
                      onChange={(e) => setEditTeacher({ ...editTeacher, email: e.target.value })} />
                    <input aria-label="Teacher phone" placeholder="Phone (optional)"
                      value={editTeacher.phone}
                      onChange={(e) => setEditTeacher({ ...editTeacher, phone: e.target.value })} />
                    <button type="submit">Save</button>
                    <button type="button" className="grey" onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>
                    <a href="#" onClick={(e) => { e.preventDefault(); setSelId(t.id); }}>
                      {t.name}
                    </a>
                  </td>
                  <td>{t.course_count}</td>
                  <td>{t.weekly_hours}</td>
                  <td>
                    <button onClick={() => startEdit(t)}>Edit</button>{" "}
                    <button className="danger" onClick={() => remove(t)}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {filteredRows.length === 0 && (
            <tr><td colSpan={4}>No teachers match this search.</td></tr>
          )}
        </tbody>
      </table>

      {sel && (
        <div className="panel">
          <h3>{sel.name}: {sel.weekly_hours} hours / week</h3>
          {(sel.email || sel.phone) && (
            <p className="muted">{[sel.email, sel.phone].filter(Boolean).join(" · ")}</p>
          )}
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