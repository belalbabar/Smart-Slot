import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

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
      if (!res.ok) {
        setError("Wrong username or password");
        return;
      }
      sessionStorage.setItem("adminUnlocked", "1");
      sessionStorage.setItem("adminName", username);
      navigate("/admin/teachers");
    } catch {
      setError("Server not reachable");
    }
  }

  return (
    <div className="login-wrap">
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