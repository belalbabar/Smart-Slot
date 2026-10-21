import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";
import HodPasswordDialog from "../HodPasswordDialog";

export default function DegreePage() {
  const { id, degreeId } = useParams();
  const { data, error, run } = useOverview(id);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  if (!data) return <p>{error || "Loading..."}</p>;
  const degree = data.degrees.find((d) => String(d.id) === degreeId);
  if (!degree) return <p>Degree not found</p>;

  const addSection = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/sessions/${id}/degrees/${degree.id}/sections`, {
        method: "POST", body: JSON.stringify({ name }),
      });
      setName("");
    });
  };

  const saveSectionName = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/sections/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name: editingName }),
      });
      setEditingId(null);
      setEditingName("");
    });
  };

  async function deleteSection(section) {
    if (!window.confirm(
      `Permanently delete Section ${section.name}, its courses, and its timetable history?`
    )) return;
    setPendingDelete(section);
  }

  async function confirmDelete({ admin_username, password }) {
    const section = pendingDelete;
    setPendingDelete(null);
    if (!section) return;
    await run(() => api(`/sections/${section.id}`, {
      method: "DELETE",
      body: JSON.stringify({ admin_username, password }),
    }));
  }

  return (
    <div>
      <p className="crumb">{data.session.name}</p>
      <h2>{degree.name}</h2>
      <form className="row" onSubmit={addSection}>
        <input placeholder="Section (e.g. A)" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button type="submit">Add Section</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Section</th><th>Courses</th><th>Actions</th></tr></thead>
        <tbody>
          {degree.sections.map((s) => (
            <tr key={s.id}>
              <td>
                {editingId === s.id ? (
                  <form className="row section-edit" onSubmit={saveSectionName}>
                    <input aria-label="Section name" value={editingName}
                      onChange={(e) => setEditingName(e.target.value)} />
                    <button type="submit">Save</button>
                    <button type="button" className="grey"
                      onClick={() => setEditingId(null)}>Cancel</button>
                  </form>
                ) : (
                  <Link to={`/sessions/${id}/degrees/${degree.id}/sections/${s.id}`}>
                    Section {s.name}
                  </Link>
                )}
              </td>
              <td>{s.courses.length}</td>
              <td>
                <button type="button" onClick={() => {
                  setEditingId(s.id);
                  setEditingName(s.name);
                }}>Edit name</button>{" "}
                <button type="button" className="danger"
                  onClick={() => deleteSection(s)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pendingDelete && (
        <HodPasswordDialog action="Delete section"
          onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}