import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";

export default function Layout() {
  const navigate = useNavigate();
  if (!localStorage.getItem("token")) return <Navigate to="/login" />;

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SmartSlot</h2>
        <NavLink to="/users">Manage Users</NavLink>
        <button className="logout" onClick={logout}>Logout</button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}