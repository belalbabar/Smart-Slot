import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";
import TeacherSelect from "../TeacherSelect";
import readXlsxFile from "read-excel-file/browser";

const emptyCourse = {
  code: "", name: "", type: "theory", credit_hours: "",
  weekly_pattern: "3", lab_kind: "", teacher_id: "",
};
const THEORY_PATTERNS = ["3", "2+1", "1+1+1", "2", "1"];

export default function SectionPage() {
  const { id, degreeId, sectionId } = useParams();
  const { data, teachers, error, run, loadTeachers } = useOverview(id);
  const [form, setForm] = useState(emptyCourse);
  const [courses, setCourses] = useState([]);
  const [copyFrom, setCopyFrom] = useState("");
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourse, setEditingCourse] = useState(emptyCourse);
  const [importCoursesPreview, setImportCoursesPreview] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importFilename, setImportFilename] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function readCourseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportCoursesPreview([]);
    setImportErrors([]);
    setImportSuccess("");
    setImportFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportErrors(["Please select an .xlsx Excel workbook."]);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportErrors(["The Excel file must be smaller than 5 MB."]);
      return;
    }
    try {
      const sheets = await readXlsxFile(file);
      const rows = sheets[0]?.data || [];
      const { parseCourseRows } = await import("../courseImport.js");
      const result = parseCourseRows(rows);
      setImportCoursesPreview(result.courses);
      setImportErrors(result.errors);
      if (result.courses.length > 500) {
        setImportErrors(["Import no more than 500 courses at a time."]);
      }
    } catch (err) {
      setImportErrors([`Could not read this Excel file: ${err.message}`]);
    }
  }

  async function importCoursesFromFile() {
    if (importErrors.length || !importCoursesPreview.length) return;
    setImportBusy(true);
    await run(async () => {
      const result = await api(`/sections/${section.id}/courses/import`, {
        method: "POST",
        body: JSON.stringify({ courses: importCoursesPreview }),
      });
      setImportCoursesPreview([]);
      setImportFilename("");
      setImportErrors([]);
      setImportSuccess(`Imported ${result.imported} courses.`);
    });
    setImportBusy(false);
  }

  async function downloadImportTemplate() {
    setImportErrors([]);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/universal");
      const data = [[
        "Course Code", "Course Name", "Type", "Credit Hours",
        "Weekly Pattern", "Teacher", "Lab Kind",
      ]];
      const blob = await writeExcelFile(data).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "SmartSlot-Course-Import-Template.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setImportErrors([`Could not create the Excel template: ${err.message}`]);
    }
  }

  useEffect(() => {
    api("/courses").then(setCourses).catch(() => {});
  }, [data]);

  const fill = (c) =>
    setForm((f) => ({
      ...f, code: c.code, name: c.name, type: c.type,
      credit_hours: String(c.credit_hours), weekly_pattern: c.weekly_pattern,
      lab_kind: c.lab_kind || "",
    }));
  const pickCode = (v) => {
    const c = courses.find((x) => x.code.toLowerCase() === v.trim().toLowerCase());
    c ? fill(c) : set("code", v);
  };
  const pickName = (v) => {
    const m = courses.filter((x) => x.name === v);
    m.length === 1 ? fill(m[0]) : set("name", v);
  };

  if (!data) return <p>{error || "Loading..."}</p>;
  const degree = data.degrees.find((d) => String(d.id) === degreeId);
  const section = degree && degree.sections.find((s) => String(s.id) === sectionId);
  if (!section) return <p>Section not found</p>;

  const others = degree.sections.filter((s) => s.id !== section.id);
  const copyCourses = () => {
    if (!copyFrom) return;
    run(async () => {
      await api(`/sections/${section.id}/copy-from/${copyFrom}`, { method: "POST" });
      setCopyFrom("");
    });
  };

  const addCourse = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/sections/${section.id}/courses`, {
        method: "POST",
        body: JSON.stringify({ ...form, teacher_id: form.teacher_id || null }),
      });
      setForm(emptyCourse);
    });
  };
  const changeTeacher = (c, v) =>
    run(() => api(`/section-courses/${c.id}`, {
      method: "PUT", body: JSON.stringify({ teacher_id: v || null }),
    }));
  const changePattern = (c, weekly_pattern) =>
    run(() => api(`/section-courses/${c.id}`, {
      method: "PUT", body: JSON.stringify({ weekly_pattern }),
    }));
  const removeCourse = (c) =>
    window.confirm(`Remove ${c.code}?`) &&
    run(() => api(`/section-courses/${c.id}`, { method: "DELETE" }));
  const editCourse = (c) => {
    setEditingCourseId(c.id);
    setEditingCourse({
      code: c.code,
      name: c.name,
      type: c.type,
      credit_hours: String(c.credit_hours),
      weekly_pattern: c.weekly_pattern,
      lab_kind: c.lab_kind || "",
      teacher_id: c.teacher_id ? String(c.teacher_id) : "",
    });
  };
  const saveCourse = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/section-courses/${editingCourseId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editingCourse,
          teacher_id: editingCourse.teacher_id || null,
          credit_hours: Number(editingCourse.credit_hours),
        }),
      });
      setEditingCourseId(null);
    });
  };
  const setEditing = (key, value) =>
    setEditingCourse((current) => ({ ...current, [key]: value }));

  return (
    <div>
      <p className="crumb">{data.session.name} / {degree.name}</p>
      <h2>Section {section.name}</h2>
      <p>
        <Link to={`/sessions/${id}/degrees/${degreeId}/sections/${section.id}/generate`}>
          <button>Generate Timetable</button>
        </Link>
      </p>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr><th>Code</th><th>Course</th><th>Type</th><th>Credits</th>
            <th>Pattern</th><th>Teacher</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {section.courses.map((c) => (
            <tr key={c.id}>
              {editingCourseId === c.id ? (
                <td colSpan={7}>
                  <form className="row course-edit" onSubmit={saveCourse}>
                    <input aria-label="Course code" required placeholder="Code"
                      value={editingCourse.code}
                      onChange={(e) => setEditing("code", e.target.value)} />
                    <input aria-label="Course name" required placeholder="Course name"
                      value={editingCourse.name}
                      onChange={(e) => setEditing("name", e.target.value)} />
                    <select aria-label="Course type" value={editingCourse.type}
                      onChange={(e) => setEditing("type", e.target.value)}>
                      <option value="theory">theory</option>
                      <option value="lab">lab</option>
                    </select>
                    <input aria-label="Credit hours" required type="number" min="1"
                      value={editingCourse.credit_hours}
                      onChange={(e) => setEditing("credit_hours", e.target.value)} />
                    {editingCourse.type === "theory" ? (
                      <select aria-label="Weekly pattern"
                        value={editingCourse.weekly_pattern}
                        onChange={(e) => setEditing("weekly_pattern", e.target.value)}>
                        {THEORY_PATTERNS.map((pattern) => (
                          <option key={pattern} value={pattern}>{pattern}</option>
                        ))}
                      </select>
                    ) : (
                      <select aria-label="Lab kind" required value={editingCourse.lab_kind}
                        onChange={(e) => setEditing("lab_kind", e.target.value)}>
                        <option value="">Lab kind</option>
                        <option value="hardware">hardware</option>
                        <option value="software">software</option>
                      </select>
                    )}
                    <TeacherSelect value={editingCourse.teacher_id} teachers={teachers}
                      onChange={(value) => setEditing("teacher_id", value)}
                      onCreated={loadTeachers} />
                    <button type="submit">Save</button>
                    <button type="button" className="grey"
                      onClick={() => setEditingCourseId(null)}>Cancel</button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.type === "lab" ? `lab (${c.lab_kind || "?"})` : "theory"}</td>
                  <td>{c.credit_hours}</td>
                  <td>{c.type === "lab" ? "3 (continuous)" : (
                    <select aria-label={`${c.code} weekly pattern`}
                      value={c.weekly_pattern}
                      onChange={(e) => changePattern(c, e.target.value)}>
                      {THEORY_PATTERNS.map((pattern) => (
                        <option key={pattern} value={pattern}>{pattern}</option>
                      ))}
                    </select>
                  )}</td>
                  <td>
                    <TeacherSelect value={c.teacher_id} teachers={teachers}
                      onChange={(v) => changeTeacher(c, v)} onCreated={loadTeachers} />
                  </td>
                  <td>
                    <button type="button" onClick={() => editCourse(c)}>Edit</button>{" "}
                    <button className="danger" onClick={() => removeCourse(c)}>Remove</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {others.length > 0 && (
        <div className="row" style={{ marginTop: 20 }}>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Copy all courses from...</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>Section {s.name} ({s.courses.length} courses)</option>
            ))}
          </select>
          <button type="button" onClick={copyCourses}>Copy</button>
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Add course</h3>
      <div className="panel">
        <h3>Import courses from Excel</h3>
        <p className="muted">
          Upload an .xlsx file with course code, course name, credit hours, weekly pattern,
          and optional teacher. Labs also need a lab kind.
        </p>
        <div className="row">
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose Excel course file" onChange={readCourseFile} />
          <button type="button" className="grey" onClick={downloadImportTemplate}>
            Download Excel template
          </button>
        </div>
        {importFilename && <p className="muted">{importFilename}</p>}
        {importSuccess && <p className="import-success">{importSuccess}</p>}
        {importErrors.map((message) => (
          <p key={message} className="error">{message}</p>
        ))}
        {importCoursesPreview.length > 0 && (
          <>
            <p className="muted">
              Preview: {importCoursesPreview.length} course{importCoursesPreview.length === 1 ? "" : "s"}
            </p>
            <div className="room-schedule-scroll">
              <table>
                <thead>
                  <tr><th>Code</th><th>Course</th><th>Type</th><th>Credits</th>
                    <th>Pattern</th><th>Teacher</th></tr>
                </thead>
                <tbody>
                  {importCoursesPreview.slice(0, 10).map((course) => (
                    <tr key={course.code}>
                      <td>{course.code}</td><td>{course.name}</td><td>{course.type}</td>
                      <td>{course.credit_hours}</td><td>{course.weekly_pattern}</td>
                      <td>{course.teacher || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importCoursesPreview.length > 10 && (
                <p className="muted">Showing the first 10 courses in the preview.</p>
              )}
            </div>
            <button type="button" onClick={importCoursesFromFile}
              disabled={importBusy || importErrors.length > 0}>
              {importBusy ? "Importing..." : `Import ${importCoursesPreview.length} courses`}
            </button>{" "}
            <button type="button" className="grey" disabled={importBusy}
              onClick={() => {
                setImportCoursesPreview([]);
                setImportErrors([]);
                setImportFilename("");
                setImportSuccess("");
              }}>Cancel</button>
          </>
        )}
      </div>
      <form className="row" onSubmit={addCourse}>
        <input list="codes" placeholder="Code" value={form.code}
          onChange={(e) => pickCode(e.target.value)} />
        <input list="names" placeholder="Course name" value={form.name}
          onChange={(e) => pickName(e.target.value)} />
        <datalist id="codes">
          {courses.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
        </datalist>
        <datalist id="names">
          {courses.map((c) => <option key={c.id} value={c.name}>{c.code}</option>)}
        </datalist>
        <select value={form.type} onChange={(e) => set("type", e.target.value)}>
          <option value="theory">theory</option>
          <option value="lab">lab</option>
        </select>
        <input type="number" placeholder="Credit hours" value={form.credit_hours}
          onChange={(e) => set("credit_hours", e.target.value)} />
        {form.type === "theory" ? (
          <select value={form.weekly_pattern}
            onChange={(e) => set("weekly_pattern", e.target.value)}>
            {THEORY_PATTERNS.map((p) => <option key={p}>{p}</option>)}
          </select>
        ) : (
          <select value={form.lab_kind} onChange={(e) => set("lab_kind", e.target.value)}>
            <option value="">Lab kind</option>
            <option value="hardware">hardware</option>
            <option value="software">software</option>
          </select>
        )}
        <TeacherSelect value={form.teacher_id} teachers={teachers}
          onChange={(v) => set("teacher_id", v)} onCreated={loadTeachers} />
        <button type="submit">Add Course</button>
      </form>
      {form.type === "lab" && (
        <p className="muted">Lab: always 3 continuous hours, placed in a matching hardware/software lab.</p>
      )}
    </div>
  );
}