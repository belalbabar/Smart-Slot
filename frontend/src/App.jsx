import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Sessions from "./pages/Sessions";
import SessionPage from "./pages/SessionPage";
import DegreePage from "./pages/DegreePage";
import SectionPage from "./pages/SectionPage";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminGate from "./pages/AdminGate";
import { Rooms } from "./pages/Resources";
import Layout from "./Layout";
import AdminLayout from "./AdminLayout";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminGate />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/teachers" />} />
          <Route path="teachers" element={<TeacherDashboard />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="users" element={<Users />} />
        </Route>

        <Route element={<Layout />}>
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/sessions/:id/degrees/:degreeId" element={<DegreePage />} />
          <Route path="/sessions/:id/degrees/:degreeId/sections/:sectionId" element={<SectionPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/sessions" />} />
      </Routes>
    </BrowserRouter>
  );
}