import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";

export default function DegreePage() {
  const { id, degreeId } = useParams();
  const { data, error, run } = useOverview(id);
  const [name, setName] = useState("");

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
        <thead><tr><th>Section</th><th>Courses</th></tr></thead>
        <tbody>
          {degree.sections.map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={`/sessions/${id}/degrees/${degree.id}/sections/${s.id}`}>
                  Section {s.name}
                </Link>
              </td>
              <td>{s.courses.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}