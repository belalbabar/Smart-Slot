
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Sessions from "./pages/Sessions";
import SessionPage from "./pages/SessionPage";
import DegreePage from "./pages/DegreePage";
import SectionPage from "./pages/SectionPage";
import TeacherDashboard from "./pages/TeacherDashboard";
import { Rooms } from "./pages/Resources";
import Layout from "./Layout";
import AdminLayout from "./AdminLayout";
import AdminGate from "./pages/AdminGate";
import GeneratePage from "./pages/GeneratePage";
import TimetablePage from "./pages/TimetablePage";

function AuthBootstrap({ children }) {
  const token = localStorage.getItem("token");
  const [ready, setReady] = useState(!token || !!localStorage.getItem("role"));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || localStorage.getItem("role")) return;
    let active = true;
    api("/auth/me").then((user) => {
      if (!active) return;
      localStorage.setItem("role", user.role);
      localStorage.setItem("username", user.username);
      localStorage.setItem("displayName", user.display_name);
      localStorage.setItem("teacherId", user.teacher_id ?? "");
    }).catch((err) => {
      if (active) setError(err.message);
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [token]);

  if (!ready) return <p>Loading account...</p>;
  if (error) return <p className="error">{error}. <a href="/login">Sign in again</a></p>;
  return children;
}

function HodOnly({ children }) {
  const role = localStorage.getItem("role");
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />;
  if (role === "hod" || role === "admin") return children;
  return <Navigate to="/sessions" replace />;
}

function AdminHome() {
  const role = localStorage.getItem("role");
  return <Navigate to={role === "timetable" ? "/sessions" : "/admin/teachers"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<AdminGate />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route path="teachers" element={<HodOnly><TeacherDashboard /></HodOnly>} />
            <Route path="rooms" element={<HodOnly><Rooms /></HodOnly>} />
            <Route path="users" element={<HodOnly><Users /></HodOnly>} />
          </Route>

          <Route element={<Layout />}>
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/rooms" element={<HodOnly><Rooms /></HodOnly>} />
            <Route path="/sessions/:id" element={<SessionPage />} />
            <Route
              path="/sessions/:id/degrees/:degreeId"
              element={<DegreePage />}
            />
            <Route
              path="/sessions/:id/degrees/:degreeId/sections/:sectionId"
              element={<SectionPage />}
            />

            <Route
              path="/sessions/:id/degrees/:degreeId/sections/:sectionId/generate"
              element={<GeneratePage />}
            />
            <Route
              path="/timetables/:tid"
              element={<TimetablePage />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/sessions" />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
