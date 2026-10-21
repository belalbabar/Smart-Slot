import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

const RETURN_KEYS = ["token", "role", "username", "displayName", "teacherId"];

export default function AdminGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (!localStorage.getItem("token")) return <Navigate to="/login" />;

  async function unlock(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Wrong username or password");
      if (!["admin", "hod"].includes(data.role)) {
        throw new Error("Admin Panel sirf HOD account se khulta hai");
      }

      const returnState = Object.fromEntries(
        RETURN_KEYS.map((key) => [key, localStorage.getItem(key)])
      );
      sessionStorage.setItem("adminReturnState", JSON.stringify(returnState));
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);
      localStorage.setItem("displayName", data.display_name);
      localStorage.setItem("teacherId", data.teacher_id ?? "");
      sessionStorage.setItem("adminGate", "1");
      navigate("/admin/teachers", { replace: true });
    } catch (err) {
      setError(err.message || "Server not reachable");
    }
  }

  return (
    <div className="login-wrap">
      <button type="button" className="back-btn" onClick={() => navigate("/sessions")}>
        ← Back
      </button>
      <form className="card" onSubmit={unlock}>
        <h1>Admin Panel</h1>
        <p className="muted">Enter admin credentials to continue</p>
        <input placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)} />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit">Open Admin Panel</button>
        <button type="button" className="grey" onClick={() => navigate("/sessions")}>
          Cancel
        </button>
      </form>
    </div>
  );
}