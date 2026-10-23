import { useEffect, useState } from "react";
import { api } from "../api";

const emptyForm = {
  username: "", password: "", display_name: "", email: "",
  role: "timetable", teacher_id: "",
};

function roleName(role) {
  return ["admin", "hod"].includes(role) ? "HOD" : "Timetable";
}

function assignedArea(role) {
  return ["admin", "hod"].includes(role)
    ? "All access"
    : "Timetable";
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [workloads, setWorkloads] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [userRows, teacherRows, workloadRows] = await Promise.all([
      api("/users"),
      api("/teachers"),
      api("/teacher-workload"),
    ]);
    setUsers(userRows);
    setTeachers(teacherRows);
    setWorkloads(workloadRows);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditId(null);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    const body = {
      role: form.role,
      teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
      display_name: form.display_name.trim() || null,
      email: form.email.trim(),
    };
    if (!editId) {
      body.username = form.username;
      body.password = form.password;
    }
    try {
      await api(editId ? `/users/${editId}` : "/users", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function editUser(user) {
    setEditId(user.id);
    setForm({
      username: user.username,
      password: "",
      display_name: user.display_name || "",
      email: user.email || "",
      role: ["admin", "hod"].includes(user.role) ? "hod" : "timetable",
      teacher_id: user.teacher_id ? String(user.teacher_id) : "",
    });
    setError("");
  }

  async function removeUser(user) {
    if (!window.confirm(`Delete the account "${user.username}"?`)) return;
    setError("");
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      if (selectedId === user.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function detailsFor(user) {
    if (!user.teacher_id) return null;
    return workloads.find((item) => item.id === user.teacher_id) || null;
  }

  return (
    <div>
      <h2>Manage Users</h2>
      <p className="muted">
        Link an existing teacher or enter a standalone display name for a timetable
        coordinator. They sign in with the username and password you set here.
      </p>
      <form className="row" onSubmit={save}>
        {!editId && (
          <>
            <input placeholder="Username" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input type="password" placeholder="Initial password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </>
        )}
        <input placeholder="Display name (if no linked teacher)"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <input type="email" required placeholder="Account email (for password reset)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="hod">HOD - all access</option>
          <option value="timetable">Timetable</option>
        </select>
        <select value={form.teacher_id}
          onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
          <option value="">No linked teacher</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
          ))}
        </select>
        <button type="submit">{editId ? "Save changes" : "Add account"}</button>
        {editId && <button type="button" className="grey" onClick={resetForm}>Cancel</button>}
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr><th>Username</th><th>Email</th><th>Role</th><th>Linked teacher</th><th>Access</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const teacher = teachers.find((item) => item.id === user.teacher_id);
            return (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email || "Not set"}</td>
                <td>{roleName(user.role)}</td>
                <td>{user.display_name || teacher?.name || "Not linked"}</td>
                <td>{assignedArea(user.role)}</td>
                <td>
                  <button type="button" onClick={() => setSelectedId(
                    selectedId === user.id ? null : user.id
                  )}>Details</button>{" "}
                  <button type="button" onClick={() => editUser(user)}>Edit</button>{" "}
                  <button type="button" className="danger" onClick={() => removeUser(user)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {users.filter((user) => user.id === selectedId).map((user) => {
        const teacher = teachers.find((item) => item.id === user.teacher_id);
        const workload = detailsFor(user);
        return (
          <div className="panel" key={user.id}>
            <h3>{user.display_name || teacher?.name || user.username}</h3>
            <p><b>Login:</b> {user.username}</p>
            <p><b>Account email:</b> {user.email || "Not set"}</p>
            <p><b>Account role:</b> {roleName(user.role)}</p>
            <p><b>Assigned areas:</b> {assignedArea(user.role)}</p>
            {teacher ? (
              <>
                <p><b>Teacher email:</b> {teacher.email || "Not provided"}</p>
                <p><b>Assigned courses:</b> {workload?.course_count ?? 0}</p>
                <p><b>Weekly workload:</b> {workload?.weekly_hours ?? 0} hours</p>
                {workload?.classes.length > 0 ? (
                  <table>
                    <thead>
                      <tr><th>Session</th><th>Degree</th><th>Section</th>
                        <th>Course</th><th>Type</th><th>Hours/week</th></tr>
                    </thead>
                    <tbody>
                      {workload.classes.map((item, index) => (
                        <tr key={`${item.code}-${index}`}>
                          <td>{item.session}</td><td>{item.degree}</td>
                          <td>{item.section}</td><td>{item.code} {item.course}</td>
                          <td>{item.type}</td><td>{item.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="muted">No active timetable courses are assigned.</p>}
              </>
            ) : <p className="muted">No teacher profile is linked to this account.</p>}
          </div>
        );
      })}
    </div>
  );
}
