import { useEffect, useState } from "react";
import { api } from "../api";

const emptyForm = {
  username: "", password: "", display_name: "", email: "",
  role: "timetable", teacher_id: "",
};

function roleName(role) {
  if (["admin", "hod"].includes(role)) return "HOD";
  if (role === "student_affairs") return "Student Affairs";
  return "Timetable";
}

function assignedArea(role) {
  if (["admin", "hod"].includes(role)) return "All access";
  return role === "student_affairs" ? "Student Affairs" : "Timetable";
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [workloads, setWorkloads] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [newTeacher, setNewTeacher] = useState({ name: "", email: "", phone: "" });
  const [addingTeacherFromDropdown, setAddingTeacherFromDropdown] = useState(false);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
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
    setAddingTeacherFromDropdown(false);
    setNewTeacher({ name: "", email: "", phone: "" });
  }

  async function addTeacherProfile() {
    const name = newTeacher.name.trim();
    if (!name) {
      setError("Enter the teacher's name.");
      return;
    }
    setCreatingTeacher(true);
    setError("");
    try {
      const teacher = await api("/teachers", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: newTeacher.email.trim() || null,
          phone: newTeacher.phone.trim() || null,
        }),
      });
      await load();
      setForm((current) => ({ ...current, teacher_id: String(teacher.id) }));
      setNewTeacher({ name: "", email: "", phone: "" });
      setAddingTeacherFromDropdown(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingTeacher(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    const editedUser = users.find((user) => user.id === editId);
    const body = {
      role: editedUser?.role === "admin" ? "admin" : form.role,
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
      role: ["admin", "hod"].includes(user.role) ? "hod" : user.role,
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
        Student Affairs accounts must be linked to a teacher profile to create
        tasks. If the teacher is not listed, add the profile in Teacher Dashboard
        first. They sign in with the username and password set here.
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
        <input type="email" required placeholder="Account email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select value={form.role}
          disabled={Boolean(editId && users.find((user) => user.id === editId)?.role === "admin")}
          onChange={(e) => {
            setForm({ ...form, role: e.target.value, teacher_id: "" });
            setAddingTeacherFromDropdown(false);
          }}>
          <option value="hod">HOD - all access</option>
          <option value="timetable">Timetable</option>
          <option value="student_affairs">Student Affairs</option>
        </select>
        {["timetable", "student_affairs"].includes(form.role) && (
          <>
            <select aria-label="Linked teacher"
              required={form.role === "student_affairs"}
              value={addingTeacherFromDropdown ? "__add_teacher__" : form.teacher_id}
              onChange={(e) => {
                if (e.target.value === "__add_teacher__") {
                  setAddingTeacherFromDropdown(true);
                  return;
                }
                setAddingTeacherFromDropdown(false);
                setForm({ ...form, teacher_id: e.target.value });
              }}>
              <option value="">
                {form.role === "student_affairs"
                  ? "Select teacher profile (required)"
                  : "Select teacher profile"}
              </option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
              ))}
              <option value="__add_teacher__">+ Add a new teacher profile…</option>
            </select>
          </>
        )}
        {addingTeacherFromDropdown && (
          <div className="panel user-new-teacher">
            <h3>Add teacher profile</h3>
            <div className="row">
              <input required aria-label="New teacher name" placeholder="Teacher name"
                value={newTeacher.name}
                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })} />
              <input aria-label="New teacher email" type="email"
                placeholder="Teacher email (optional)" value={newTeacher.email}
                onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })} />
              <input aria-label="New teacher phone" placeholder="Phone (optional)"
                value={newTeacher.phone}
                onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })} />
              <button type="button" disabled={creatingTeacher || !newTeacher.name.trim()}
                onClick={addTeacherProfile}>
                {creatingTeacher ? "Adding..." : "Add and link teacher"}
              </button>
              <button type="button" className="grey"
                onClick={() => setAddingTeacherFromDropdown(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <button type="submit" disabled={addingTeacherFromDropdown || creatingTeacher}>
          {editId ? "Save changes" : "Add account"}
        </button>
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
                <td>{teacher?.name || "Not linked"}</td>
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
            <p><b>Linked teacher:</b> {teacher?.name || "Not linked"}</p>
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
