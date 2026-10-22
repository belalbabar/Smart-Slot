import { useEffect, useState } from "react";
import { api } from "./api";

export default function CrudPage({
  title,
  path,
  fields,
  canDelete = true,
  readOnly = false,
  onSelect,
  selectedId,
}) {
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
      {!readOnly && (
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
      )}
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            {fields.map((f) => <th key={f.key}>{f.label}</th>)}
            {!readOnly && <th></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className={selectedId === it.id ? "selected-row" : ""}>
              {fields.map((f) => (
                <td key={f.key}>
                  {onSelect && f.key === "name" ? (
                    <button type="button" className="link-button"
                      onClick={() => onSelect(it)}>{it[f.key]}</button>
                  ) : it[f.key]}
                </td>
              ))}
              {!readOnly && (
                <td>
                  <button onClick={() => startEdit(it)}>Edit</button>{" "}
                  {canDelete && (
                    <button className="danger" onClick={() => remove(it.id)}>Delete</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}