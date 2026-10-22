import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*]/g, "_").trim() || "SmartSlot-timetable";
}

function hourLabel(hour) {
  const value = hour % 12 || 12;
  return `${value}:00 ${hour < 12 ? "AM" : "PM"}`;
}

function sectionCode(section) {
  const degreeCode = section.degree_name.split(/\s+/).filter(Boolean)
    .map((word) => word[0]).join("").toUpperCase();
  return `${degreeCode}-${section.section_name}`;
}

export default function TimetableDownloadMenu({ timetableId }) {
  const [timetable, setTimetable] = useState(null);
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sourceRef = useRef(null);

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
  const shownDays = settings?.days || [];

  async function downloadImageOrPdf(format) {
    if (!sourceRef.current || !section) throw new Error("Timetable grid is not ready");
    const [{ default: html2canvas }, pdfModule] = await Promise.all([
      import("html2canvas"),
      format === "pdf" ? import("jspdf") : Promise.resolve(null),
    ]);
    const canvas = await html2canvas(sourceRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: sourceRef.current.scrollWidth,
    });
    const filename = `${safeFilename(timetable.name)}-${safeFilename(section.label)}`;
    if (format === "image") {
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }
    const { jsPDF } = pdfModule;
    const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
    const margin = 8;
    const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const maxHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG",
      (pdf.internal.pageSize.getWidth() - width) / 2,
      (pdf.internal.pageSize.getHeight() - height) / 2, width, height);
    pdf.save(`${filename}.pdf`);
  }

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
      else await downloadImageOrPdf(format);
    } catch (err) {
      setError(`Could not export timetable: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function hourCells(day) {
    const cells = [];
    for (let hour = settings.day_start; hour < settings.day_end; hour++) {
      if (hour >= settings.lunch_start && hour < settings.lunch_end) {
        if (hour === settings.lunch_start) {
          cells.push(<td key="lunch" className="lunch"
            colSpan={settings.lunch_end - settings.lunch_start}>Lunch Break</td>);
        }
        continue;
      }
      const entry = section.entries.find((item) =>
        item.day.toLowerCase() === day.toLowerCase() && Number(item.start) === hour
      );
      if (!entry) {
        cells.push(<td key={hour}></td>);
        continue;
      }
      const duration = Number(entry.end) - Number(entry.start);
      cells.push(
        <td key={hour} colSpan={duration} className={`slot ${entry.type}`}>
          <b>{entry.code} {entry.course}</b>
          <div>{entry.teacher}</div>
          <div>{entry.room}</div>
          <div className="slot-foot">
            <span className="tag">{entry.type === "lab" ? "LAB" : "LEC"}</span>
            <span>{hourLabel(entry.start)} - {hourLabel(entry.end)}</span>
          </div>
        </td>
      );
      hour += duration - 1;
    }
    return cells;
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
      {section && createPortal(
        <div ref={sourceRef} className="timetable-export export-source">
          <h2>{timetable.name}</h2>
          <p>
            {section.label} | Working days: {shownDays.join(", ")} | Hours:{" "}
            {hourLabel(settings.day_start)} - {hourLabel(settings.day_end)}
          </p>
          <table className="grid">
            <thead>
              <tr>
                <th>Day</th>
                {Array.from(
                  { length: settings.day_end - settings.day_start },
                  (_, index) => settings.day_start + index
                ).map((hour) => {
                  if (hour >= settings.lunch_start && hour < settings.lunch_end) {
                    return hour === settings.lunch_start ? (
                      <th key="lunch" colSpan={settings.lunch_end - settings.lunch_start}>
                        Lunch
                      </th>
                    ) : null;
                  }
                  return <th key={hour}>{hourLabel(hour)}</th>;
                })}
              </tr>
            </thead>
            <tbody>{shownDays.map((day) => (
              <tr key={day}><td className="dayname">{day}</td>{hourCells(day)}</tr>
            ))}</tbody>
          </table>
        </div>,
        document.body
      )}
    </>
  );
}
