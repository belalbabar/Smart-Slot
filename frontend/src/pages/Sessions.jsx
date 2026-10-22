import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../api";
import HodPasswordDialog from "../HodPasswordDialog";

export default function Sessions() {
  const { loadSessions } = useOutletContext();
  const [items, setItems] = useState([]);
  const [archived, setArchived] = useState([]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    setItems(await api("/sessions"));
    setArchived(await api("/sessions?status=archived"));
    loadSessions();
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await api(editId ? `/sessions/${editId}` : "/sessions", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      setEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function archive(s) {
    const typed = window.prompt(
      `"${s.name}" will be archived (can be restored within 30 days).\nType the session name to confirm:`
    );
    if (typed === null) return;
    try {
      await api(`/sessions/${s.id}/archive`, {
        method: "POST", body: JSON.stringify({ confirm: typed }),
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore(s) {
    setError("");
    try {
      await api(`/sessions/${s.id}/restore`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function permanentlyDelete({ admin_username, password }) {
    const session = pendingDelete;
    setPendingDelete(null);
    if (!session) return;
    setError("");
    try {
      await api(`/sessions/${session.id}`, {
        method: "DELETE",
        body: JSON.stringify({ admin_username, password }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2>Sessions</h2>
      <form className="row" onSubmit={save}>
        <input placeholder="Session (e.g. Fall 2024)" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button type="submit">{editId ? "Update" : "Add Session"}</button>
        {editId && (
          <button type="button" className="grey"
            onClick={() => { setEditId(null); setName(""); }}>Cancel</button>
        )}
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead><tr><th>Session</th><th></th></tr></thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td><Link to={`/sessions/${s.id}`}>{s.name}</Link></td>
              <td>
                <button onClick={() => { setEditId(s.id); setName(s.name); }}>Edit</button>{" "}
                <button className="danger" onClick={() => archive(s)}>Archive</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {archived.length > 0 && (
        <>
          <h3 style={{ marginTop: 28 }}>Archived</h3>
          <table>
            <tbody>
              {archived.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.archived_at && s.archived_at.slice(0, 10)}</td>
                  <td>
                    <button onClick={() => restore(s)}>Restore</button>{" "}
                    <button className="danger" onClick={() => setPendingDelete(s)}>
                      Delete permanently
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {pendingDelete && (
        <HodPasswordDialog action="Delete permanently"
          onCancel={() => setPendingDelete(null)} onConfirm={permanentlyDelete} />
      )}
    </div>
  );
}