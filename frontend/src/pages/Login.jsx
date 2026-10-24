import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);
      localStorage.setItem("displayName", data.display_name);
      localStorage.setItem("teacherId", data.teacher_id ?? "");
      navigate(data.role === "student_affairs" ? "/student-affairs" : "/sessions");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={handleLogin}>
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">S</span>
          <span>SmartSlot</span>
        </div>
        <div className="login-heading">
          <h1>Welcome back</h1>
          <p>Sign in to continue to your workspace.</p>
        </div>
        <label className="login-field">
          Username
          <input autoComplete="username" placeholder="Enter your username" value={username}
          onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="login-field">
          Password
          <input type="password" autoComplete="current-password"
          placeholder="Enter your password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Link className="forgot-password-link" to="/forgot-password">
          Forgot password?
        </Link>
        {error && <p className="error login-error" role="alert">{error}</p>}
        <button type="submit">Sign in</button>
        <p className="login-footer">Timetable and department workspace</p>
      </form>
    </div>
  );
}