import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";
import HodPasswordDialog from "../HodPasswordDialog";

export default function SessionPage() {
  const { id } = useParams();
  const { data, error, run } = useOverview(id);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  if (!data) return <p>{error || "Loading..."}</p>;

  const addDegree = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/sessions/${id}/degrees`, {
        method: "POST", body: JSON.stringify({ name }),
      });
      setName("");
    });
  };

  const removeDegree = (d) => {
    let toRemove = d.sections;
    if (d.sections.length > 1) {
      const names = d.sections.map((s) => s.name);
      const ans = window.prompt(
        `Which section to remove from ${d.name}?\nType one of: ${names.join(", ")} or ALL`
      );
      if (!ans) return;
      const a = ans.trim().toUpperCase();
      if (a !== "ALL") {
        toRemove = d.sections.filter((s) => s.name === a);
        if (toRemove.length === 0) { alert("Section not found"); return; }
      }
    } else if (!window.confirm(`Remove ${d.name}${d.sections.length ? " and its section" : ""}?`)) {
      return;
    }
    const removeAll = toRemove.length === d.sections.length;
    if (toRemove.length === 0 && d.sections.length > 0) return;
    if (!window.confirm(
      d.sections.length
        ? `Permanently delete ${toRemove.map((s) => `Section ${s.name}`).join(", ")}? This also deletes their courses and timetable history.`
        : `Remove ${d.name} from this session?`
    )) return;
    setPendingDelete({ toRemove, removeAll, degree: d });
  };

  async function confirmDelete({ admin_username, password }) {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    run(async () => {
      for (const s of pending.toRemove) {
        await api(`/sections/${s.id}`, {
          method: "DELETE",
          body: JSON.stringify({ admin_username, password }),
        });
      }
      if (pending.removeAll) {
        await api(`/sessions/${id}/degrees/${pending.degree.id}`, {
          method: "DELETE",
          body: JSON.stringify({ admin_username, password }),
        });
      }
    });
  };

  return (
    <div>
      <h2>{data.session.name}</h2>
      <form className="row" onSubmit={addDegree}>
        <input placeholder="Degree (e.g. Computer Engineering)" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button type="submit">Add Degree</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Degree</th><th>Sections</th><th></th></tr></thead>
        <tbody>
          {data.degrees.map((d) => (
            <tr key={d.id}>
              <td><Link to={`/sessions/${id}/degrees/${d.id}`}>{d.name}</Link></td>
              <td>{d.sections.map((s) => s.name).join(", ") || "-"}</td>
              <td>
                <button className="danger" onClick={() => removeDegree(d)}>
                  Delete section(s)
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pendingDelete && (
        <HodPasswordDialog action={pendingDelete.toRemove.length ? "Delete section(s)" : "Remove degree"}
          onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}