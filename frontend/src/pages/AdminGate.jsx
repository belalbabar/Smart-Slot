import { Navigate } from "react-router-dom";

export default function AdminGate() {
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />;
  return <Navigate to="/admin" replace />;
}