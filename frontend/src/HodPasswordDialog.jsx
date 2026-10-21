import { useState } from "react";

export default function HodPasswordDialog({ action, onCancel, onConfirm }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(e) {
    e.preventDefault();
    onConfirm({ admin_username: username, password });
  }

  return (
    <div className="dialog-backdrop">
      <form className="card action-dialog" onSubmit={submit}>
        <h2>Confirm {action}</h2>
        <p className="muted">Enter the HOD credentials to continue.</p>
        <input autoFocus required placeholder="HOD username" value={username}
          onChange={(e) => setUsername(e.target.value)} />
        <input required type="password" autoComplete="current-password"
          placeholder="HOD password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <div className="row">
          <button type="submit">{action}</button>
          <button type="button" className="grey" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
