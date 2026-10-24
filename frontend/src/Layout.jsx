import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";

const NOTIFICATION_EVENT = "student-affairs-notifications-updated";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const loggedIn = !!localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const hasAdminPanel = ["admin", "hod", "timetable"].includes(role);
  const [tree, setTree] = useState([]);
  const [openKeys, setOpenKeys] = useState({ root: true });
  const [unreadEscalationCount, setUnreadEscalationCount] = useState(0);
  const [studentAffairsError, setStudentAffairsError] = useState("");
  const isHod = ["admin", "hod"].includes(role);
  const hasStudentAffairsAccess = isHod
    || role === "student_affairs"
    || (role === "timetable" && !!localStorage.getItem("teacherId"));
  const isStudentAffairsOnly = role === "student_affairs";
  const canCreateStudentAffairsTasks = isStudentAffairsOnly
    || (role === "timetable" && !!localStorage.getItem("teacherId"));
  const showTimetableTree = !isStudentAffairsOnly
    && !location.pathname.startsWith("/student-affairs");
  const searchParams = new URLSearchParams(location.search);
  const studentAffairsView = searchParams.get("view")
    || (searchParams.has("status")
      ? "open"
      : role === "student_affairs"
        || (role === "timetable" && !!localStorage.getItem("teacherId"))
        ? "create"
        : null);
  const studentAffairsStatus = searchParams.get("status") || "open";

  async function loadTree() {
    try {
      setTree(await api("/tree"));
    } catch (e) {}
  }

  useEffect(() => {
    if (loggedIn) loadTree();
  }, []);

  useEffect(() => {
    if (!loggedIn || !hasStudentAffairsAccess) return undefined;
    async function loadNotifications() {
      try {
        const result = await api("/student-affairs/notifications");
        setUnreadEscalationCount(result.unread_escalation_count);
        setStudentAffairsError("");
      } catch (error) {
        setStudentAffairsError(error.message);
      }
    }
    loadNotifications();
    window.addEventListener(NOTIFICATION_EVENT, loadNotifications);
    return () => window.removeEventListener(NOTIFICATION_EVENT, loadNotifications);
  }, [loggedIn, hasStudentAffairsAccess]);

  if (!loggedIn) return <Navigate to="/login" />;
  if (isStudentAffairsOnly && location.pathname !== "/student-affairs") {
    return <Navigate to="/student-affairs" replace />;
  }

  const isOpen = (k) => !!openKeys[k];
  const toggle = (k) => setOpenKeys((o) => ({ ...o, [k]: !o[k] }));
  const arrow = (k) => (
    <span className="arrow" onClick={() => toggle(k)}>{isOpen(k) ? "▾" : "▸"}</span>
  );

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("displayName");
    localStorage.removeItem("teacherId");
    sessionStorage.removeItem("adminGate");
    sessionStorage.removeItem("adminReturnState");
    navigate("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SmartSlot</h2>

        {isHod && (
          <div className="module-nav">
            <div className="admin-title">Modules</div>
            <NavLink to="/sessions">Timetable</NavLink>
            <NavLink to="/rooms">Rooms &amp; Labs</NavLink>
            <NavLink to="/student-affairs" className="sa-nav-link">
              Student Affairs
              {unreadEscalationCount > 0 && (
                <span className="sa-escalation-dot" aria-label="Overdue tasks need attention"
                  title="Overdue tasks need attention" />
              )}
            </NavLink>
            {location.pathname.startsWith("/student-affairs") && (
              <div className="sa-subnav">
                <Link className={studentAffairsStatus === "open"
                  && studentAffairsView !== "create" ? "active" : ""}
                  to="/student-affairs?status=open">Open tasks</Link>
                <Link className={studentAffairsStatus === "completed" ? "active" : ""}
                  to="/student-affairs?status=completed">Completed tasks</Link>
              </div>
            )}
          </div>
        )}
        {!isHod && hasStudentAffairsAccess && (
          <div className="module-nav">
            <NavLink to="/student-affairs" className="sa-nav-link">
              Student Affairs
            </NavLink>
            {location.pathname.startsWith("/student-affairs") && (
              <div className="sa-subnav">
                {canCreateStudentAffairsTasks && (
                  <Link className={studentAffairsView === "create" ? "active" : ""}
                    to="/student-affairs?view=create">Create a new task</Link>
                )}
                <Link className={studentAffairsStatus === "open"
                  && studentAffairsView !== "create" ? "active" : ""}
                  to="/student-affairs?status=open">Open tasks</Link>
                <Link className={studentAffairsStatus === "completed" ? "active" : ""}
                  to="/student-affairs?status=completed">Completed tasks</Link>
              </div>
            )}
          </div>
        )}
        {studentAffairsError && (
          <p className="error sa-nav-error" role="status">
            Student Affairs: {studentAffairsError}
          </p>
        )}

        {showTimetableTree && (
          <>
            <div className="nav-head">
              {arrow("root")}
              <NavLink to="/sessions" end onDoubleClick={() => toggle("root")}>Sessions</NavLink>
            </div>

            {isOpen("root") && tree.map((s) => (
              <div key={s.id}>
                <div className="nav-head l1">
                  {arrow("s" + s.id)}
                  <NavLink to={`/sessions/${s.id}`} end
                    onDoubleClick={() => toggle("s" + s.id)}>{s.name}</NavLink>
                </div>
                {isOpen("s" + s.id) && s.degrees.map((d) => (
                  <div key={d.id}>
                    <div className="nav-head l2">
                      {arrow("d" + d.id)}
                      <NavLink to={`/sessions/${s.id}/degrees/${d.id}`} end
                        onDoubleClick={() => toggle("d" + d.id)}>{d.name}</NavLink>
                    </div>
                    {isOpen("d" + d.id) && d.sections.map((sec) => (
                      <NavLink key={sec.id} className="sec-link"
                        to={`/sessions/${s.id}/degrees/${d.id}/sections/${sec.id}`}>
                        Section {sec.name}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        <div className="admin-box">
          {hasAdminPanel && (
            <NavLink to="/admin" className="admin-link">Admin Panel</NavLink>
          )}
          <button className="logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <Outlet context={{ loadSessions: loadTree }} />
      </main>
    </div>
  );
}