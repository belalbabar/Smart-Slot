import { useEffect, useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api";

export default function Layout() {
  const navigate = useNavigate();
  const loggedIn = !!localStorage.getItem("token");
  const [tree, setTree] = useState([]);
  const [openKeys, setOpenKeys] = useState({ root: true });

  async function loadTree() {
    try {
      setTree(await api("/tree"));
    } catch (e) {}
  }

  useEffect(() => {
    if (loggedIn) loadTree();
  }, []);

  if (!loggedIn) return <Navigate to="/login" />;

  const isOpen = (k) => !!openKeys[k];
  const toggle = (k) => setOpenKeys((o) => ({ ...o, [k]: !o[k] }));
  const arrow = (k) => (
    <span className="arrow" onClick={() => toggle(k)}>{isOpen(k) ? "▾" : "▸"}</span>
  );

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SmartSlot</h2>

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

        <div className="admin-box">
          <NavLink to="/admin" className="admin-link">⚙ Admin</NavLink>
          <button className="logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <Outlet context={{ loadSessions: loadTree }} />
      </main>
    </div>
  );
}