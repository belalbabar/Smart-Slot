import { useRef, useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";

export default function AdminLayout() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState(localStorage.getItem("adminPhoto") || "");
  const name = sessionStorage.getItem("adminName") || "Admin";

  if (!localStorage.getItem("token")) return <Navigate to="/login" />;
  if (sessionStorage.getItem("adminUnlocked") !== "1")
    return <Navigate to="/admin/login" />;

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
    sessionStorage.removeItem("adminUnlocked");
    sessionStorage.removeItem("adminName");
    navigate("/sessions");
  }

  return (
    <div className="app">
      <aside className="sidebar">
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
          <div className="admin-title">Admin Panel</div>
        </div>

        <NavLink to="/admin/teachers">Teacher Dashboard</NavLink>
        <NavLink to="/admin/rooms">Rooms & Labs</NavLink>
        <NavLink to="/admin/users">Manage Users</NavLink>

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