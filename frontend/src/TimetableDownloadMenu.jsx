import { useEffect, useState } from "react";
import { api } from "./api";
import {
  downloadTimetableImage,
  downloadTimetablePdf,
  sectionCode,
} from "./timetableExport";

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*]/g, "_").trim() || "SmartSlot-timetable";
}

function hourLabel(hour) {
  const value = hour % 12 || 12;
  return `${value}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export default function TimetableDownloadMenu({ timetableId }) {
  const [timetable, setTimetable] = useState(null);
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/timetables/${timetableId}`).then((data) => {
      if (!active) return;
      setTimetable(data);
      setSectionId(String(data.sections[0]?.id ?? ""));
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [timetableId]);

  const section = timetable?.sections.find((item) => String(item.id) === sectionId);
  const settings = timetable?.settings;
  async function downloadExcel() {
    const { default: writeExcelFile } = await import("write-excel-file/universal");
    const rows = timetable.sections.flatMap((item) => item.entries.map((entry) => [
      sectionCode(item), entry.day, hourLabel(entry.start), hourLabel(entry.end),
      `${entry.code} ${entry.course}`, entry.type === "lab" ? "Lab" : "Theory",
      entry.teacher, entry.room,
    ]));
    const headers = ["Section", "Day", "Start", "End", "Course", "Type", "Teacher", "Room"];
    const columns = [
      { width: 24 }, { width: 14 }, { width: 12 }, { width: 12 },
      { width: 34 }, { width: 12 }, { width: 24 }, { width: 18 },
    ];
    const blob = await writeExcelFile([headers, ...rows], { columns }).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(timetable.name)}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function download(format) {
    setError("");
    setBusy(true);
    try {
      if (!timetable) throw new Error("Timetable is still loading");
      if (format === "excel") await downloadExcel();
      else if (!section || !settings) throw new Error("Select a section to export");
      else if (format === "image") await downloadTimetableImage(timetable, section, settings);
      else await downloadTimetablePdf(timetable, section, settings);
    } catch (err) {
      setError(`Could not export timetable: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="download-menu">
        <details>
          <summary>Download</summary>
          <div className="download-options">
            <button type="button" disabled={busy || !timetable}
              onClick={() => download("excel")}>Excel</button>
            <button type="button" disabled={busy || !timetable}
              onClick={() => download("image")}>Image (PNG)</button>
            <button type="button" disabled={busy || !timetable}
              onClick={() => download("pdf")}>PDF</button>
          </div>
        </details>
        {error && <p className="error download-error">{error}</p>}
        {timetable && timetable.sections.length > 1 && (
          <select aria-label="Section to download" value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}>
            {timetable.sections.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}
