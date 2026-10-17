import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";

const f = (h) => (h % 12 === 0 ? 12 : h % 12);
const fmt = (h) => `${f(h)}:00 ${h < 12 ? "AM" : "PM"}`;
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function TimetablePage() {
  const { tid } = useParams();
  const location = useLocation();
  const [tt, setTt] = useState(null);
  const [secId, setSecId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/timetables/${tid}`)
      .then((d) => { setTt(d); setSecId(String(d.sections[0]?.id ?? "")); })
      .catch((e) => setError(e.message));
  }, [tid]);

  if (!tt) return <p>{error || "Loading..."}</p>;
  const st = tt.settings;
  const sec = tt.sections.find((s) => String(s.id) === secId);
  const warnings = location.state?.warnings || [];

  const shownDays = [...WEEK];
  if (st.days.includes("Saturday")) shownDays.push("Saturday");
  const inLunch = (h) => h >= st.lunch_start && h < st.lunch_end;

  const head = [];
  for (let h = st.day_start; h < st.day_end; h++) {
    if (inLunch(h)) {
      if (h === st.lunch_start)
        head.push(<th key={h} colSpan={st.lunch_end - st.lunch_start}>
          {f(st.lunch_start)}-{f(st.lunch_end)}</th>);
      continue;
    }
    head.push(<th key={h}>{f(h)}-{f(h + 1)}</th>);
  }

  const lunchCell = (h) => (
    <td key={"l" + h} className="lunch" rowSpan={shownDays.length}
      colSpan={st.lunch_end - st.lunch_start}>Lunch Break</td>
  );

  function offRow(d, di) {
    const cells = [];
    let h = st.day_start;
    while (h < st.day_end) {
      if (inLunch(h)) {
        if (di === 0 && h === st.lunch_start) cells.push(lunchCell(h));
        h++;
        continue;
      }
      const s = h;
      let run = 0;
      while (h < st.day_end && !inLunch(h)) { run++; h++; }
      cells.push(
        <td key={s} colSpan={run} className="off">{s === st.day_start ? "Off" : ""}</td>
      );
    }
    return <tr key={d}><td className="dayname">{d}</td>{cells}</tr>;
  }

  function dayRow(d, di) {
    if (!st.days.includes(d)) return offRow(d, di);
    const cells = [];
    for (let h = st.day_start; h < st.day_end; h++) {
      if (inLunch(h)) {
        if (di === 0 && h === st.lunch_start) cells.push(lunchCell(h));
        continue;
      }
      const e = sec.entries.find((x) => x.day === d && x.start === h);
      if (!e) { cells.push(<td key={h}></td>); continue; }
      const len = e.end - e.start;
      cells.push(
        <td key={h} colSpan={len} className={"slot " + e.type}>
          <b>{e.code} {e.course}</b>
          {e.teacher !== "TBA" && <div>{e.teacher}</div>}
          <div>{e.room}</div>
          <div className="slot-foot">
            <span className="tag">{e.type === "lab" ? "LAB" : "LEC"}</span>
            <span>{fmt(e.start)} - {fmt(e.end)}</span>
          </div>
        </td>
      );
      h += len - 1;
    }
    return <tr key={d}><td className="dayname">{d}</td>{cells}</tr>;
  }

  return (
    <div>
      <p className="crumb">
        <Link to={`/sessions/${tt.session_id}/degrees/${tt.degree_id}/sections/${tt.section_id}/generate`}>
          Back to generate
        </Link>
      </p>
      <h2>{tt.name}</h2>
      {location.state?.secs !== undefined && (
        <p className="muted">Generated in {location.state.secs} seconds</p>
      )}
      {warnings.map((w, i) => <p key={i} className="error">{w}</p>)}

      {tt.sections.length > 1 && (
        <div className="row">
          <select value={secId} onChange={(e) => setSecId(e.target.value)}>
            {tt.sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {sec && (
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Day</th>{head}</tr></thead>
            <tbody>{shownDays.map((d, i) => dayRow(d, i))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}