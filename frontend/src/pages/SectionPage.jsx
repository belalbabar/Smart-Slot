import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useOverview } from "../useOverview";
import TeacherSelect from "../TeacherSelect";

const emptyCourse = {
  code: "", name: "", type: "theory", credit_hours: "",
  weekly_pattern: "3", lab_kind: "", teacher_id: "",
};

export default function SectionPage() {
  const { id, degreeId, sectionId } = useParams();
  const { data, teachers, error, run, loadTeachers } = useOverview(id);
  const [form, setForm] = useState(emptyCourse);
  const [courses, setCourses] = useState([]);
  const [copyFrom, setCopyFrom] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
  const removeCourse = (c) =>
    window.confirm(`Remove ${c.code}?`) &&
    run(() => api(`/section-courses/${c.id}`, { method: "DELETE" }));

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
            <th>Pattern</th><th>Teacher</th><th></th></tr>
        </thead>
        <tbody>
          {section.courses.map((c) => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>{c.name}</td>
              <td>{c.type === "lab" ? `lab (${c.lab_kind || "?"})` : "theory"}</td>
              <td>{c.credit_hours}</td>
              <td>{c.type === "lab" ? "3 (continuous)" : c.weekly_pattern}</td>
              <td>
                <TeacherSelect value={c.teacher_id} teachers={teachers}
                  onChange={(v) => changeTeacher(c, v)} onCreated={loadTeachers} />
              </td>
              <td><button className="danger" onClick={() => removeCourse(c)}>Remove</button></td>
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
            {["3", "2+1", "1+1+1", "2", "1"].map((p) => <option key={p}>{p}</option>)}
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