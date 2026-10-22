const THEORY_PATTERNS = new Set(["3", "2+1", "1+1+1", "2", "1"]);
const HEADER_ALIASES = {
  code: ["code", "coursecode", "courseid"],
  name: ["name", "coursename", "course", "subject"],
  credit_hours: ["credithours", "credits", "credit", "ch"],
  weekly_pattern: ["weeklypattern", "pattern", "classpattern"],
  teacher: ["teacher", "teachername", "instructor", "instructorname"],
  type: ["type", "coursetype"],
  lab_kind: ["labkind", "labtype"],
};

function normalizeHeader(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseCourseRows(rows) {
  if (!rows.length || rows.length < 2) {
    return { courses: [], errors: ["The Excel sheet must contain a header row and at least one course."] };
  }

  const headers = rows[0].map(normalizeHeader);
  const columns = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])
  );
  const required = ["code", "name", "credit_hours", "weekly_pattern"];
  const missing = required.filter((field) => columns[field] === -1);
  if (missing.length) {
    return {
      courses: [],
      errors: [`Missing required columns: ${missing.join(", ")}.`],
    };
  }

  const courses = [];
  const errors = [];
  const seenCodes = new Set();
  for (const [index, row] of rows.slice(1).entries()) {
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    const value = (field) => columns[field] === -1
      ? ""
      : String(row[columns[field]] ?? "").trim();
    const code = value("code");
    const name = value("name");
    const creditText = value("credit_hours");
    const creditHours = Number(creditText);
    const pattern = value("weekly_pattern").replace(/\s+/g, "");
    const declaredType = value("type").toLowerCase();
    const labKind = value("lab_kind").toLowerCase();
    const type = declaredType || (labKind || /^lab/i.test(pattern) ? "lab" : "theory");
    const rowErrors = [];

    if (!code) rowErrors.push("course code is required");
    if (!name) rowErrors.push("course name is required");
    if (!creditText || !Number.isInteger(creditHours) || creditHours < 1) {
      rowErrors.push("credit hours must be a positive whole number");
    }
    if (!["theory", "lab"].includes(type)) rowErrors.push("type must be theory or lab");
    if (type === "theory" && !THEORY_PATTERNS.has(pattern)) {
      rowErrors.push("weekly pattern must be 3, 2+1, 1+1+1, 2, or 1");
    }
    if (type === "lab" && !["hardware", "software"].includes(labKind)) {
      rowErrors.push("lab kind must be hardware or software");
    }
    const codeKey = code.toLowerCase();
    if (code && seenCodes.has(codeKey)) rowErrors.push(`duplicate course code "${code}"`);
    if (code) seenCodes.add(codeKey);

    if (rowErrors.length) {
      errors.push(`Row ${index + 2}: ${rowErrors.join("; ")}.`);
      continue;
    }
    const teacher = value("teacher");
    courses.push({
      code,
      name,
      type,
      credit_hours: creditHours,
      weekly_pattern: type === "lab" ? "3" : pattern,
      lab_kind: type === "lab" ? labKind : "",
      teacher: ["tba", "n/a", "-", "not available yet"].includes(teacher.toLowerCase())
        ? ""
        : teacher,
    });
  }

  if (!courses.length && !errors.length) {
    errors.push("The Excel sheet does not contain any course rows.");
  }
  return { courses, errors };
}
