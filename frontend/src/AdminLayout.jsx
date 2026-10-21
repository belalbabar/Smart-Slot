import { useRef, useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";

export default function AdminLayout() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState(localStorage.getItem("adminPhoto") || "");
  const role = localStorage.getItem("role");
  const isHod = ["admin", "hod"].includes(role);
  const name = localStorage.getItem("displayName") || "Admin";

  if (!localStorage.getItem("token")) return <Navigate to="/login" />;
  if (!isHod) return <Navigate to="/sessions" replace />;
  if (sessionStorage.getItem("adminGate") !== "1")
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
      try { localStorage.setItem("adminPhoto", reader.result); } catch {}
    };
    reader.readAsDataURL(file);
  }

  function exitAdmin() {
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
        {isHod && (
          <div className="avatar-box">
            <div className="avatar-wrap">
              <div className="avatar" onClick={() => fileRef.current.click()}>
                {photo ? <img src={photo} alt="" /> : <span>{name[0].toUpperCase()}</span>}
              </div>
              <button type="button" className="avatar-edit"
                onClick={() => fileRef.current.click()}>✎</button>
              <input type="file" accept="image/*" hidden ref={fileRef} onChange={pickPhoto} />
            </div>
            <div className="avatar-name">{name}</div>
            <div className="admin-title">HOD Panel</div>
          </div>
        )}

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