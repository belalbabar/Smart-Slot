import { useEffect, useState } from "react";
import { api } from "./api";

export default function CrudPage({ title, path, fields, canDelete = true }) {
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setItems(await api("/" + path));
  }

  useEffect(() => {
    setForm(empty);
    setEditId(null);
    setError("");
    load();
  }, [path]);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await api(editId ? `/${path}/${editId}` : "/" + path, {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      setForm(empty);
      setEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(item) {
    setEditId(item.id);
    setForm(Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? ""])));
  }

  async function remove(id) {
    if (!window.confirm("Delete this item?")) return;
    try {
      await api(`/${path}/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2>{title}</h2>
      <form className="row" onSubmit={save}>
        {fields.map((f) =>
          f.options ? (
            <select key={f.key} value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
              <option value="">{f.label}</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input key={f.key} placeholder={f.label} value={form[f.key]}
              type={f.type || "text"}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          )
        )}
        <button type="submit">{editId ? "Update" : "Add"}</button>
        {editId && (
          <button type="button" className="grey"
            onClick={() => { setEditId(null); setForm(empty); }}>Cancel</button>
        )}
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            {fields.map((f) => <th key={f.key}>{f.label}</th>)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              {fields.map((f) => <td key={f.key}>{it[f.key]}</td>)}
              <td>
                <button onClick={() => startEdit(it)}>Edit</button>{" "}
                {canDelete && (
                  <button className="danger" onClick={() => remove(it.id)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}