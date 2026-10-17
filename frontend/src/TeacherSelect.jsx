import { api } from "./api";

export default function TeacherSelect({ value, teachers, onChange, onCreated }) {
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
    onChange(v);
  }

  return (
    <select value={value ?? ""} onChange={(e) => handle(e.target.value)}>
      <option value="">Not available yet</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      <option value="__new__">+ New teacher...</option>
    </select>
  );
}