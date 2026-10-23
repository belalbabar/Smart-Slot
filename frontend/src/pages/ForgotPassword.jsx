import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const result = await api("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ username, email }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card" onSubmit={requestReset}>
        <h1>Reset password</h1>
        <p className="muted">Enter your SmartSlot username and registered email.</p>
        <input required autoComplete="username" placeholder="Username"
          value={username} onChange={(event) => setUsername(event.target.value)} />
        <input required type="email" autoComplete="email" placeholder="Email"
          value={email} onChange={(event) => setEmail(event.target.value)} />
        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send reset link"}
        </button>
        <Link className="forgot-password-link" to="/login">Back to login</Link>
      </form>
    </div>
  );
}
