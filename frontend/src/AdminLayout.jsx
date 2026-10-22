import { useRef, useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api";

export default function AdminLayout() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const role = localStorage.getItem("role");
  const isHod = ["admin", "hod"].includes(role);
  const username = localStorage.getItem("username") || "";
  const photoKey = `profilePhoto:${username}`;
  const [photo, setPhoto] = useState(localStorage.getItem(photoKey) || "");
  const [name, setName] = useState(localStorage.getItem("displayName") || username);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [error, setError] = useState("");

  if (!localStorage.getItem("token")) return <Navigate to="/login" />;
  if (!isHod && role !== "timetable") return <Navigate to="/sessions" replace />;
  if (isHod && sessionStorage.getItem("adminGate") !== "1")
    return <Navigate to="/admin/login" replace />;

  function pickPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Please choose an image smaller than 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result);
      try { localStorage.setItem(photoKey, reader.result); } catch {}
    };
    reader.readAsDataURL(file);
  }

  async function saveDisplayName(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({ display_name: nameDraft }),
      });
      setName(result.display_name);
      localStorage.setItem("displayName", result.display_name);
      const returnState = JSON.parse(
        sessionStorage.getItem("adminReturnState") || "null"
      );
      if (returnState?.username === username) {
        returnState.displayName = result.display_name;
        sessionStorage.setItem("adminReturnState", JSON.stringify(returnState));
      }
      setEditingName(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function exitAdmin() {
    if (!isHod) {
      navigate("/sessions", { replace: true });
      return;
    }
    const returnState = JSON.parse(sessionStorage.getItem("adminReturnState") || "null");
    for (const key of ["token", "role", "username", "displayName", "teacherId"]) {
      const value = returnState?.[key];
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    sessionStorage.removeItem("adminReturnState");
    sessionStorage.removeItem("adminGate");
    navigate("/sessions", { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="avatar-box">
          <div className="avatar-wrap">
            <div className="avatar" onClick={() => fileRef.current.click()}>
              {photo ? <img src={photo} alt="" /> : <span>{name[0]?.toUpperCase() || "U"}</span>}
            </div>
            <button type="button" className="avatar-edit"
              aria-label="Change profile picture"
              onClick={() => fileRef.current.click()}>✎</button>
            <input type="file" accept="image/*" hidden ref={fileRef} onChange={pickPhoto} />
          </div>
          {editingName ? (
            <form className="profile-name-form" onSubmit={saveDisplayName}>
              <input autoFocus aria-label="Display name" maxLength={80}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)} />
              <div className="row">
                <button type="submit">Save</button>
                <button type="button" className="grey" onClick={() => {
                  setNameDraft(name);
                  setEditingName(false);
                }}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="profile-name">
              <span className="avatar-name">{name}</span>
              <button type="button" className="profile-name-edit"
                aria-label="Edit display name" title="Edit display name"
                onClick={() => { setNameDraft(name); setEditingName(true); }}>✎</button>
            </div>
          )}
          <div className="profile-username">@{username}</div>
          {error && <p className="error profile-error">{error}</p>}
        </div>

        <NavLink to="/admin/rooms">Rooms & Labs</NavLink>
        {isHod && (
          <>
            <NavLink to="/admin/teachers">Teacher Dashboard</NavLink>
            <NavLink to="/admin/users">Manage Users</NavLink>
          </>
        )}

        <div className="admin-box">
          <button className="grey" onClick={exitAdmin}>← Back to Timetables</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}