import { api } from "./api";

export default function TeacherSelect({ value, teachers, onChange, onCreated }) {
  const canCreate = ["admin", "hod"].includes(localStorage.getItem("role"));

  async function handle(v) {
    if (v === "__new__") {
      const name = window.prompt("Teacher name:");
      if (!name || !name.trim()) return;
      try {
        const t = await api("/teachers", {
          method: "POST", body: JSON.stringify({ name }),
        });
        await onCreated();
        onChange(String(t.id));
      } catch (e) {
        alert(e.message);
      }
      return;
    }
    if (v === "__edit__") {
      const teacher = teachers.find((item) => String(item.id) === String(value));
      if (!teacher) return;
      const name = window.prompt(
        `New name for ${teacher.name} (updates all course assignments):`,
        teacher.name,
      );
      if (!name || !name.trim()) return;
      try {
        await api(`/teachers/${teacher.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            email: teacher.email || "",
            phone: teacher.phone || "",
          }),
        });
        await onCreated();
      } catch (e) {
        alert(e.message);
      }
      return;
    }
    onChange(v);
  }

  return (
    <select value={value ?? ""} onChange={(e) => handle(e.target.value)}>
      <option value="">Not available yet</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      {canCreate && value && teachers.some((teacher) => String(teacher.id) === String(value))
        && <option value="__edit__">Edit selected teacher...</option>}
      {canCreate && <option value="__new__">+ New teacher...</option>}
    </select>
  );
}