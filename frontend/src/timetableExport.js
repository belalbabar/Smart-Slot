const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*]/g, "_").trim() || "SmartSlot-timetable";
}

export function sectionCode(section) {
  const degreeName = section.degree_name
    || section.label.split(" - Section ")[0]
    || section.label;
  const degreeCode = degreeName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const sectionName = section.section_name
    || section.label.match(/ - Section (.+)$/)?.[1]
    || "";
  return `${degreeCode}-${sectionName}`;
}

function hourLabel(hour) {
  const value = hour % 12 || 12;
  return `${value}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export function timetableHeaderLines(timetable, section, settings) {
  const degree = section.degree_name || section.label.split(" - Section ")[0];
  const sectionName = section.section_name
    || section.label.match(/ - Section (.+)$/)?.[1]
    || "";
  const term = section.batch || timetable.session_name || timetable.name;
  const academicTerm = term.replace(/\b(Fall|Spring|Summer)\s+(\d{4})\b/i,
    (_, season, year) => `${year} ${
      { fall: "F", spring: "S", summer: "Su" }[season.toLowerCase()]
    }`);
  const semester = settings.semester
    ? `Semester ${settings.semester} - ${academicTerm}`
    : academicTerm;
  const shift = Number(settings.day_start) < 12 ? "Morning" : "Afternoon";
  return [
    "UNIVERSITY OF ENGINEERING AND TECHNOLOGY",
    `DEPARTMENT OF ${degree.toUpperCase()}`,
    `${degree} - ${sectionName} (${semester}) (${shift})`,
  ];
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]);
}

function dayRows(section, settings, days) {
  return days.map((day) => ({
    day,
    entries: section.entries
      .filter((entry) => String(entry.day).trim().toLowerCase() === day.toLowerCase())
      .sort((a, b) => Number(a.start) - Number(b.start)),
    off: !settings.days.some((workingDay) =>
      String(workingDay).trim().toLowerCase() === day.toLowerCase()
    ),
  }));
}

function buildSvg(timetable, section, settings, days) {
  const dayWidth = 150;
  const hourWidth = 150;
  const titleHeight = 142;
  const headerHeight = 56;
  const rowHeight = 140;
  const start = Number(settings.day_start);
  const end = Number(settings.day_end);
  const width = dayWidth + (end - start) * hourWidth;
  const height = titleHeight + headerHeight + days.length * rowHeight + 24;
  const cells = [];
  const text = (x, y, content, size = 18, weight = 400, color = "#2d3748") =>
    `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(content)}</text>`;
  const rect = (x, y, w, h, fill, radius = 0) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="#d5deea"/>`;

  cells.push(rect(0, 0, width, height, "#ffffff"));
  const headings = timetableHeaderLines(timetable, section, settings);
  cells.push(text(24, 34, headings[0], 21, 700, "#172b4d"));
  cells.push(text(24, 60, headings[1], 18, 600, "#334155"));
  cells.push(text(24, 86, headings[2], 16, 600, "#334155"));
  cells.push(text(24, 112, headings[3], 14, 600, "#64748b"));

  const headerY = titleHeight;
  cells.push(rect(0, headerY, dayWidth, headerHeight, "#f2f5fa"));
  cells.push(text(18, headerY + 34, "Day", 17, 600));
  for (let hour = start; hour < end; hour++) {
    const x = dayWidth + (hour - start) * hourWidth;
    const inLunch = hour >= Number(settings.lunch_start) && hour < Number(settings.lunch_end);
    if (inLunch && hour !== Number(settings.lunch_start)) continue;
    const span = inLunch
      ? Number(settings.lunch_end) - Number(settings.lunch_start)
      : 1;
    const cellX = inLunch
      ? dayWidth + (Number(settings.lunch_start) - start) * hourWidth
      : x;
    cells.push(rect(cellX, headerY, span * hourWidth, headerHeight,
      inLunch ? "#f7f1e3" : "#f2f5fa"));
    cells.push(text(cellX + 12, headerY + 34,
      inLunch
        ? `${hourLabel(settings.lunch_start)} - ${hourLabel(settings.lunch_end)}`
        : `${hourLabel(hour)} - ${hourLabel(hour + 1)}`,
      15, 600));
  }

  dayRows(section, settings, days).forEach((row, index) => {
    const y = titleHeight + headerHeight + index * rowHeight;
    cells.push(rect(0, y, dayWidth, rowHeight, row.off ? "#f1f3f7" : "#f7fafc"));
    cells.push(text(18, y + 32, row.day, 17, 600));
    if (row.off) {
      cells.push(text(dayWidth + 20, y + 32, "Off day", 16, 400, "#718096"));
      return;
    }
    for (let hour = start; hour < end; hour++) {
      const inLunch = hour >= Number(settings.lunch_start) && hour < Number(settings.lunch_end);
      if (inLunch && hour !== Number(settings.lunch_start)) continue;
      const x = dayWidth + (hour - start) * hourWidth;
      const entry = row.entries.find((item) =>
        Number(item.start) <= hour && Number(item.end) > hour
      );
      if (inLunch) {
        const span = Number(settings.lunch_end) - Number(settings.lunch_start);
        cells.push(rect(x, y, span * hourWidth, rowHeight, "#f7f1e3"));
        cells.push(text(x + 14, y + 32, "Break", 15, 600, "#74694b"));
        hour += span - 1;
      } else if (entry) {
        if (Number(entry.start) !== hour) continue;
        const duration = Number(entry.end) - Number(entry.start);
        const fill = entry.type === "lab" ? "#efe8f8" : "#e3ecfa";
        cells.push(rect(x, y, duration * hourWidth, rowHeight, fill, 4));
        cells.push(text(x + 12, y + 28, `${entry.code} ${entry.course}`, 15, 600));
        cells.push(text(x + 12, y + 54, entry.teacher, 14));
        cells.push(text(x + 12, y + 78, entry.room, 14));
        cells.push(text(x + 12, y + 112,
          `${hourLabel(entry.start)} - ${hourLabel(entry.end)}`, 13, 400, "#4a5568"));
        hour += duration - 1;
      } else {
        cells.push(rect(x, y, hourWidth, rowHeight, "#ffffff"));
      }
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cells.join("")}</svg>`;
}

function saveBlob(blob, filename) {
  if (!blob || blob.size === 0) throw new Error("The exported file was empty");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadTimetableImage(timetable, section, settings) {
  const days = WEEK.filter((day) =>
    settings.days.includes(day) || day !== "Saturday"
  );
  const svg = buildSvg(timetable, section, settings, days);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();
    const scale = Math.min(2, 4096 / image.width, 4096 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the PNG image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG creation failed")), "image/png")
    );
    if (png.size < 8) throw new Error("PNG creation returned an invalid image");
    const signature = new Uint8Array(await png.slice(0, 8).arrayBuffer());
    if (signature.join(",") !== "137,80,78,71,13,10,26,10") {
      throw new Error("PNG creation returned an invalid signature");
    }
    saveBlob(png, `${safeFilename(timetable.name)}-${safeFilename(sectionCode(section))}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function createTimetablePdf(timetable, section, settings) {
  const [{ jsPDF }] = await Promise.all([import("jspdf")]);
  const days = WEEK.filter((day) =>
    settings.days.includes(day) || day !== "Saturday"
  );
  const rows = dayRows(section, settings, days);
  const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
  const margin = 8;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const dayWidth = 25;
  const hourWidth = (pageWidth - margin * 2 - dayWidth) /
    (Number(settings.day_end) - Number(settings.day_start));
  const titleY = 12;
  const headerY = 38;
  const headerHeight = 11;
  const rowHeight = Math.min(26, (190 - headerY - headerHeight) / rows.length);
  const start = Number(settings.day_start);
  const end = Number(settings.day_end);

  const headings = timetableHeaderLines(timetable, section, settings);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(headings[0], margin, titleY);
  pdf.setFontSize(9);
  pdf.text(headings[1], margin, titleY + 8);
  pdf.setFont("helvetica", "normal");
  pdf.text(headings[2], margin, titleY + 16);

  pdf.setFillColor(242, 245, 250);
  pdf.rect(margin, headerY, dayWidth, headerHeight, "F");
  pdf.setFont("helvetica", "bold");
  pdf.text("Day", margin + 2, headerY + 7);
  for (let hour = start; hour < end; hour++) {
    const lunchStart = Number(settings.lunch_start);
    const lunchEnd = Number(settings.lunch_end);
    const lunch = hour >= lunchStart && hour < lunchEnd;
    if (lunch && hour !== lunchStart) continue;
    const span = lunch ? lunchEnd - lunchStart : 1;
    const x = margin + dayWidth + (hour - start) * hourWidth;
    pdf.setFillColor(...(lunch ? [247, 241, 227] : [242, 245, 250]));
    pdf.rect(x, headerY, hourWidth * span, headerHeight, "F");
    pdf.setFontSize(7);
    pdf.text(lunch
      ? `${hourLabel(lunchStart)}-${hourLabel(lunchEnd)}`
      : `${hourLabel(hour)}-${hourLabel(hour + 1)}`, x + 1, headerY + 7, {
      maxWidth: hourWidth * span - 2,
    });
    hour += span - 1;
  }

  rows.forEach((row, index) => {
    const y = headerY + headerHeight + index * rowHeight;
    pdf.setFillColor(...(row.off ? [241, 243, 247] : [247, 250, 252]));
    pdf.rect(margin, y, dayWidth, rowHeight, "F");
    pdf.setDrawColor(213, 222, 234);
    pdf.rect(margin, y, dayWidth, rowHeight);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(row.day, margin + 2, y + 6);
    if (row.off) {
      pdf.setFont("helvetica", "normal");
      pdf.text("Off day", margin + dayWidth + 3, y + 6);
      return;
    }

    for (let hour = start; hour < end; hour++) {
      const lunchStart = Number(settings.lunch_start);
      const lunchEnd = Number(settings.lunch_end);
      const lunch = hour >= lunchStart && hour < lunchEnd;
      if (lunch && hour !== lunchStart) continue;
      const x = margin + dayWidth + (hour - start) * hourWidth;
      const entry = row.entries.find((item) =>
        Number(item.start) <= hour && Number(item.end) > hour
      );
      const span = lunch
        ? lunchEnd - lunchStart
        : entry && Number(entry.start) === hour
          ? Number(entry.end) - Number(entry.start)
          : 1;
      if (lunch) pdf.setFillColor(247, 241, 227);
      else if (entry?.type === "lab") pdf.setFillColor(239, 232, 248);
      else if (entry) pdf.setFillColor(227, 236, 250);
      else pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(213, 222, 234);
      pdf.rect(x, y, hourWidth * span, rowHeight, "FD");

      if (lunch) {
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        pdf.text("Break", x + 2, y + 6);
      } else if (entry && Number(entry.start) === hour) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.text(`${entry.code} ${entry.course}`, x + 2, y + 5, {
          maxWidth: hourWidth * span - 4,
        });
        pdf.setFont("helvetica", "normal");
        pdf.text(entry.teacher, x + 2, y + 10, { maxWidth: hourWidth * span - 4 });
        pdf.text(entry.room, x + 2, y + 15, { maxWidth: hourWidth * span - 4 });
        pdf.setFontSize(6);
        pdf.text(`${hourLabel(entry.start)}-${hourLabel(entry.end)}`,
          x + 2, y + rowHeight - 2, { maxWidth: hourWidth * span - 4 });
      }
      hour += span - 1;
    }
  });

  return {
    pdf,
    filename: `${safeFilename(timetable.name)}-${safeFilename(sectionCode(section))}.pdf`,
  };
}

export async function downloadTimetablePdf(timetable, section, settings) {
  const { pdf, filename } = await createTimetablePdf(timetable, section, settings);
  pdf.save(filename);
}
