import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";

const f = (h) => (h % 12 === 0 ? 12 : h % 12);
const fmt = (h) => `${f(h)}:00 ${h < 12 ? "AM" : "PM"}`;
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_ORDER = [...WEEK, "Saturday"];

function hourValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const match = /^(\d{1,2}):\d{2}/.exec(String(value));
  return match ? Number(match[1]) : Number.NaN;
}

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*]/g, "_").trim() || "SmartSlot-timetable";
}

function sectionCode(section) {
  const degreeCode = section.degree_name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return `${degreeCode}-${section.section_name}`;
}

export default function TimetablePage() {
  const { tid } = useParams();
  const location = useLocation();
  const [tt, setTt] = useState(null);
  const [secId, setSecId] = useState("");
  const [error, setError] = useState("");
  const exportRef = useRef(null);

  useEffect(() => {
    api(`/timetables/${tid}`)
      .then((d) => { setTt(d); setSecId(String(d.sections[0]?.id ?? "")); })
      .catch((e) => setError(e.message));
  }, [tid]);

  if (!tt) return <p>{error || "Loading..."}</p>;
  const st = tt.settings;
  const sec = tt.sections.find((s) => String(s.id) === secId);
  const warnings = location.state?.warnings || [];
  const exportRows = tt.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      Section: sectionCode(section),
      Day: entry.day,
      Start: fmt(entry.start),
      End: fmt(entry.end),
      Course: `${entry.code} ${entry.course}`,
      Type: entry.type === "lab" ? "Lab" : "Theory",
      Teacher: entry.teacher,
      Room: entry.room,
      _dayOrder: DAY_ORDER.indexOf(entry.day),
      _start: entry.start,
    }))
  ).sort((a, b) => a._dayOrder - b._dayOrder || a._start - b._start);

  async function downloadExcel() {
    try {
      const { default: writeExcelFile } = await import("write-excel-file/universal");
      const headers = ["Section", "Day", "Start", "End", "Course", "Type", "Teacher", "Room"];
      const data = [
        headers,
        ...exportRows.map((row) => [
          row.Section, row.Day, row.Start, row.End,
          row.Course, row.Type, row.Teacher, row.Room,
        ]),
      ];
      const columns = [
        { width: 24 }, { width: 14 }, { width: 12 }, { width: 12 },
        { width: 34 }, { width: 12 }, { width: 24 }, { width: 18 },
      ];
      const blob = await writeExcelFile(data, { columns }).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(tt.name)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(`Could not export Excel file: ${err.message}`);
    }
  }

  async function downloadPdf() {
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      if (!exportRef.current) throw new Error("Timetable grid is not ready");
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        windowWidth: exportRef.current.scrollWidth,
      });
      const document = new jsPDF({ orientation: "landscape", format: "a4" });
      const margin = 8;
      const maxWidth = document.internal.pageSize.getWidth() - margin * 2;
      const maxHeight = document.internal.pageSize.getHeight() - margin * 2;
      const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const width = canvas.width * scale;
      const height = canvas.height * scale;
      document.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (document.internal.pageSize.getWidth() - width) / 2,
        (document.internal.pageSize.getHeight() - height) / 2,
        width,
        height
      );
      document.save(`${safeFilename(tt.name)}.pdf`);
    } catch (err) {
      setError(`Could not export PDF file: ${err.message}`);
    }
  }

  const shownDays = [...WEEK];
  if (st.days.includes("Saturday")) shownDays.push("Saturday");
  const inLunch = (h) => h >= st.lunch_start && h < st.lunch_end;
  const visibleEntries = sec?.entries.filter((entry) => {
    const day = String(entry.day).trim().toLowerCase();
    const start = hourValue(entry.start);
    const end = hourValue(entry.end);
    return st.days.some((workingDay) => workingDay.toLowerCase() === day)
      && start >= st.day_start && start < st.day_end && !inLunch(start)
      && end > start && end <= st.day_end;
  }) ?? [];

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
      const e = sec.entries.find((x) =>
        String(x.day).trim().toLowerCase() === d.toLowerCase()
        && hourValue(x.start) === h
      );
      if (!e) { cells.push(<td key={h}></td>); continue; }
      const start = hourValue(e.start);
      const end = hourValue(e.end);
      const len = end - start;
      cells.push(
        <td key={h} colSpan={len} className={"slot " + e.type}>
          <b>{e.code} {e.course}</b>
          {e.teacher !== "TBA" && <div>{e.teacher}</div>}
          <div>{e.room}</div>
          <div className="slot-foot">
            <span className="tag">{e.type === "lab" ? "LAB" : "LEC"}</span>
            <span>{fmt(start)} - {fmt(end)}</span>
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
      <div className="row">
        <button type="button" onClick={downloadPdf}>Download PDF</button>
        <button type="button" onClick={downloadExcel}>Download Excel</button>
      </div>
      {error && <p className="error">{error}</p>}
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
          <div ref={exportRef} className="timetable-export">
            <h2>{tt.name}</h2>
            <p>
              Working days: {st.days.join(", ")} | Hours: {fmt(st.day_start)} - {fmt(st.day_end)}
              {" | "}Lunch: {fmt(st.lunch_start)} - {fmt(st.lunch_end)}
            </p>
            {sec.entries.length === 0 ? (
              <p className="error">This timetable has no saved class entries. Generate it again after checking the section courses and rooms.</p>
            ) : visibleEntries.length === 0 ? (
              <p className="error">
                Saved classes do not match the days and hours shown in this grid.
                Generate the timetable again to refresh it.
              </p>
            ) : (
              <table className="grid">
                <thead><tr><th>Day</th>{head}</tr></thead>
                <tbody>{shownDays.map((d, i) => dayRow(d, i))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}