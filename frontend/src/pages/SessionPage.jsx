import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";

export default function SessionPage() {
  const { id } = useParams();
  const { data, error, run } = useOverview(id);
  const [name, setName] = useState("");

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
    run(async () => {
      for (const s of toRemove) {
        await api(`/sections/${s.id}/archive`, { method: "POST" });
      }
      if (removeAll) {
        await api(`/sessions/${id}/degrees/${d.id}`, { method: "DELETE" });
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
              <td><button className="danger" onClick={() => removeDegree(d)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}