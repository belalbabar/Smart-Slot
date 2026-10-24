import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api";
import NavIcon from "./NavIcon";

const NOTIFICATION_EVENT = "student-affairs-notifications-updated";

export default function AdminLayout() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const role = localStorage.getItem("role");
  const isHod = ["admin", "hod"].includes(role);
  const hasStudentAffairsAccess = isHod
    || role === "student_affairs"
    || (role === "timetable" && !!localStorage.getItem("teacherId"));
  const username = localStorage.getItem("username") || "";
  const photoKey = `profilePhoto:${username}`;
  const [photo, setPhoto] = useState(localStorage.getItem(photoKey) || "");
  const [name, setName] = useState(localStorage.getItem("displayName") || username);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [unreadEscalationCount, setUnreadEscalationCount] = useState(0);
  const [studentAffairsError, setStudentAffairsError] = useState("");

  useEffect(() => {
    if (!hasStudentAffairsAccess) return undefined;
    async function loadNotifications() {
      try {
        const result = await api("/student-affairs/notifications");
        setUnreadEscalationCount(result.unread_escalation_count);
        setStudentAffairsError("");
      } catch (err) {
        setStudentAffairsError(err.message);
      }
    }
    loadNotifications();
    window.addEventListener(NOTIFICATION_EVENT, loadNotifications);
    return () => window.removeEventListener(NOTIFICATION_EVENT, loadNotifications);
  }, [hasStudentAffairsAccess]);

  useEffect(() => {
    if (!photoMenuOpen) return undefined;
    function closePhotoMenu(event) {
      if (event.target instanceof Element
          && event.target.closest(".avatar-edit, .avatar-menu")) return;
      setPhotoMenuOpen(false);
    }
    document.addEventListener("pointerdown", closePhotoMenu);
    return () => document.removeEventListener("pointerdown", closePhotoMenu);
  }, [photoMenuOpen]);

  if (!localStorage.getItem("token")) return <Navigate to="/login" />;
  if (role === "student_affairs") return <Navigate to="/student-affairs" replace />;
  if (!isHod && role !== "timetable") return <Navigate to="/sessions" replace />;

  function pickPhoto(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Please choose an image smaller than 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result);
      try { localStorage.setItem(photoKey, reader.result); } catch {}
      setPhotoMenuOpen(false);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    localStorage.removeItem(photoKey);
    setPhoto("");
    setPhotoMenuOpen(false);
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
      setEditingName(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function exitAdmin() {
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
              aria-label="Edit profile picture"
              onClick={() => setPhotoMenuOpen((open) => !open)}>✎</button>
            {photoMenuOpen && (
              <div className="avatar-menu">
                <button type="button" onClick={() => fileRef.current.click()}>
                  Change photo
                </button>
                {photo && (
                  <button type="button" className="remove-photo" onClick={removePhoto}>
                    Remove photo
                  </button>
                )}
              </div>
            )}
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

        {isHod && (
          <div className="module-nav">
            <div className="admin-title">Modules</div>
            <NavLink to="/sessions"><NavIcon name="calendar" />Timetable</NavLink>
            <NavLink to="/student-affairs" className="sa-nav-link">
              <span className="nav-label"><NavIcon name="people" />Student Affairs</span>
              {unreadEscalationCount > 0 && (
                <span className="sa-escalation-dot" aria-label="Overdue tasks need attention"
                  title="Overdue tasks need attention" />
              )}
            </NavLink>
          </div>
        )}
        {!isHod && <NavLink to="/admin/rooms">
          <NavIcon name="building" />Rooms &amp; Labs
        </NavLink>}
        {!isHod && hasStudentAffairsAccess && (
          <NavLink to="/student-affairs" className="sa-nav-link">
            <span className="nav-label"><NavIcon name="people" />Student Affairs</span>
          </NavLink>
        )}
        {studentAffairsError && (
          <p className="error sa-nav-error" role="status">
            Student Affairs: {studentAffairsError}
          </p>
        )}
        {isHod && (
          <>
            <NavLink to="/admin/teachers">
              <NavIcon name="book" />Teacher Dashboard
            </NavLink>
            <NavLink to="/admin/users">
              <NavIcon name="shield" />Manage Users
            </NavLink>
          </>
        )}

        <div className="admin-box">
          <button className="grey" onClick={exitAdmin}>← Back</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}