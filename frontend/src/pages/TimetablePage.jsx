import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { buildTimetableGrid } from "../timetableGrid";
import {
  downloadTimetableImage,
  downloadTimetablePdf,
  sectionCode,
} from "../timetableExport";

const f = (h) => (h % 12 === 0 ? 12 : h % 12);
const fmt = (h) => `${f(h)}:00 ${h < 12 ? "AM" : "PM"}`;
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_ORDER = [...WEEK, "Saturday"];

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*]/g, "_").trim() || "SmartSlot-timetable";
}

export default function TimetablePage() {
  const { tid } = useParams();
  const location = useLocation();
  const [tt, setTt] = useState(null);
  const [secId, setSecId] = useState("");
  const [error, setError] = useState("");
  const [clash, setClash] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const scrollRef = useRef(null);
  const dragPointRef = useRef(null);
  const scrollFrameRef = useRef(null);

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
      if (!sec) throw new Error("Select a section to export");
      await downloadTimetablePdf(tt, sec, st);
    } catch (err) {
      setError(`Could not export PDF file: ${err.message}`);
    }
  }

  async function downloadImage() {
    try {
      if (!sec) throw new Error("Select a section to export");
      await downloadTimetableImage(tt, sec, st);
    } catch (err) {
      setError(`Could not export image: ${err.message}`);
    }
  }

  async function reloadTimetable() {
    const data = await api(`/timetables/${tid}`);
    setTt(data);
  }

  async function moveEntry(entryId, day, start) {
    const entry = sec?.entries.find((item) => item.entry_id === entryId);
    if (!entry || (entry.day === day && Number(entry.start) === start)) return;
    setClash("");
    setError("");
    try {
      await api(`/timetables/${tid}/entries/${entryId}`, {
        method: "PUT",
        body: JSON.stringify({ day, start }),
      });
      setUndoStack((stack) => [...stack, {
        entry_id: entryId, day: entry.day, start: Number(entry.start),
      }]);
      setError("");
      await reloadTimetable();
    } catch (err) {
      if (err.message.toLowerCase().includes("clash")) {
        setClash(
          `Clash: ${sec.label} — ${entry.code} ${entry.course} cannot be moved to `
          + `${day} ${fmt(start)}. ${err.message.replace(/^Clash:\s*/i, "")}`
        );
      }
      else setError(err.message);
    }
  }

  async function undoMove() {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    try {
      setClash("");
      await api(`/timetables/${tid}/entries/${previous.entry_id}`, {
        method: "PUT",
        body: JSON.stringify({ day: previous.day, start: previous.start }),
      });
      setUndoStack((stack) => stack.slice(0, -1));
      await reloadTimetable();
    } catch (err) {
      setClash(err.message);
    }
  }

  async function restoreOriginal() {
    setClash("");
    setError("");
    try {
      await api(`/timetables/${tid}/restore-original`, { method: "POST" });
      setUndoStack([]);
      await reloadTimetable();
    } catch (err) {
      if (err.message.toLowerCase().includes("clash")) setClash(err.message);
      else setError(err.message);
    }
  }

  function handleDrop(event, day, start) {
    event.preventDefault();
    stopAutoScroll();
    const entryId = Number(event.dataTransfer.getData("text/plain"));
    if (entryId) moveEntry(entryId, day, start);
  }

  function stopAutoScroll() {
    dragPointRef.current = null;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function autoScroll() {
    const point = dragPointRef.current;
    if (!point) {
      scrollFrameRef.current = null;
      return;
    }
    const edge = 72;
    const step = 14;
    const area = scrollRef.current;
    if (area) {
      const bounds = area.getBoundingClientRect();
      if (point.x < bounds.left + edge) area.scrollLeft -= step;
      else if (point.x > bounds.right - edge) area.scrollLeft += step;
    }
    if (point.y < edge) window.scrollBy(0, -step);
    else if (point.y > window.innerHeight - edge) window.scrollBy(0, step);
    scrollFrameRef.current = window.requestAnimationFrame(autoScroll);
  }

  function handleGridDragOver(event) {
    event.preventDefault();
    dragPointRef.current = { x: event.clientX, y: event.clientY };
    if (scrollFrameRef.current === null) {
      scrollFrameRef.current = window.requestAnimationFrame(autoScroll);
    }
  }

  const shownDays = [...WEEK];
  if (st.days.includes("Saturday")) shownDays.push("Saturday");
  const grid = sec ? buildTimetableGrid(sec.entries, st, shownDays) : null;
  const dayStart = Number(st.day_start);
  const dayEnd = Number(st.day_end);
  const gridColumns = { gridTemplateColumns: grid?.columns ?? "90px" };
  const originalEntries = new Map(
    (st.original_entries || []).map((entry) => [entry.entry_id, entry])
  );
  const hasScheduleChanges = !!sec && (
    undoStack.length > 0 || sec.entries.some((entry) => {
      const original = originalEntries.get(entry.entry_id);
      return original && (
        original.day !== entry.day
        || Number(original.start) !== Number(entry.start)
        || Number(original.room_id) !== Number(entry.room_id)
      );
    })
  );

  function dayRow(row) {
    const cells = row.off
      ? [<div key="off" className="timetable-grid-cell off"
        style={{ gridColumn: `2 / span ${dayEnd - dayStart}` }}>Off day</div>]
      : row.cells.map((cell) => {
        if (cell.kind === "lunch") {
          return (
            <div key="lunch" className="timetable-grid-cell lunch"
              style={{ gridColumn: `${cell.column} / span ${cell.span}` }}>
              Break
            </div>
          );
        }
        if (cell.kind === "empty") {
          return (
            <div key={cell.column} className="timetable-grid-cell"
              style={{ gridColumn: String(cell.column) }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, row.day, cell.column + dayStart - 2)} />
          );
        }

        const { entry, start, end } = cell;
        return (
          <div key={entry.entry_id} className={`timetable-grid-cell slot ${entry.type}`}
            style={{ gridColumn: `${cell.column} / span ${cell.span}` }}
            draggable onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", String(entry.entry_id));
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={stopAutoScroll}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, row.day, start)}>
            <b>{entry.code} {entry.course}</b>
            {entry.teacher !== "TBA" && <div>{entry.teacher}</div>}
            <div>{entry.room}</div>
            <div className="slot-foot">
              <span className="tag">{entry.type === "lab" ? "LAB" : "LEC"}</span>
              <span>{fmt(start)} - {fmt(end)}</span>
            </div>
          </div>
        );
      });
    return (
      <div key={row.day} className="timetable-grid-row" style={gridColumns}>
        <div className="timetable-grid-cell dayname">{row.day}</div>
        {cells}
      </div>
    );
  }
  const timeHeaders = (grid?.headers ?? []).map((header) => (
    <div key={header.column} className="timetable-grid-cell"
      style={{ gridColumn: `${header.column} / span ${header.span}` }}>
      {header.start !== undefined
        ? `${fmt(header.start)} - ${fmt(header.end)}`
        : `${fmt(header.label)} - ${fmt(header.label + 1)}`}
    </div>
  ));

  return (
    <div>
      <p className="crumb">
        <Link to={`/sessions/${tt.session_id}/degrees/${tt.degree_id}/sections/${tt.section_id}/generate`}>
          Back to generate
        </Link>
      </p>
      <div className="row">
        <button type="button" onClick={downloadPdf}>Download PDF</button>
        <button type="button" onClick={downloadImage}>Download Image</button>
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
        <div ref={scrollRef} className="timetable-scroll">
          <div className="timetable-export">
            <h2>{tt.name}</h2>
            {sec.entries.length === 0 ? (
              <p className="error">This timetable has no saved class entries. Generate it again after checking the section courses and rooms.</p>
            ) : grid?.visibleEntryCount === 0 ? (
              <p className="error">
                Saved classes do not match the days and hours shown in this grid.
                Generate the timetable again to refresh it.
              </p>
            ) : (
              <>
                <div className="timetable-grid" onDragOver={handleGridDragOver}>
                  <div className="timetable-grid-row timetable-grid-header" style={gridColumns}>
                    <div className="timetable-grid-cell dayname">Day</div>
                    {timeHeaders}
                  </div>
                  {grid?.rows.map(dayRow)}
                </div>
              </>
            )}
            {hasScheduleChanges && (
              <div className="timetable-edit-actions">
                {undoStack.length > 0 && (
                  <button type="button" className="small-action"
                    title="Undo last timetable change" onClick={undoMove}>↶ Undo</button>
                )}
                <button type="button" className="small-action"
                  onClick={restoreOriginal}>Restore original</button>
              </div>
            )}
            {clash && <p role="alert" className="clash-warning">{clash}</p>}
          </div>
        </div>
      )}
    </div>
  );
}