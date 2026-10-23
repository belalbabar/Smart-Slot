import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

function PasswordField({ label, value, onChange }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="password-field">
      <span>{label}</span>
      <span className="password-input-wrap">
        <input required type={visible ? "text" : "password"}
          autoComplete="new-password" minLength={8} value={value}
          onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="password-visibility"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((shown) => !shown)}>
          {visible ? "◉" : "◎"}
        </button>
      </span>
    </label>
  );
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new link.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify({ token, username, new_password: password }),
      });
      setComplete(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card" onSubmit={resetPassword}>
        <h1>Reset password</h1>
        {complete ? (
          <>
            <p className="success-message" role="status">
              Your password has been reset. Sign in with your new password.
            </p>
            <Link className="button-link" to="/login">Go to login</Link>
          </>
        ) : (
          <>
            <p className="muted">Enter your username and choose a new password.</p>
            <input required autoComplete="username" placeholder="Username"
              value={username} onChange={(event) => setUsername(event.target.value)} />
            <PasswordField label="New password" value={password} onChange={setPassword} />
            <PasswordField label="Confirm new password" value={confirmation}
              onChange={setConfirmation} />
            <p className="muted">Use at least 8 characters.</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Resetting..." : "Reset password"}
            </button>
            <Link className="forgot-password-link" to="/login">Back to login</Link>
          </>
        )}
      </form>
    </div>
  );
}
