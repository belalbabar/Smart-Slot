import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

const NOTIFICATION_EVENT = "student-affairs-notifications-updated";

function notifyNavigation() {
  window.dispatchEvent(new Event(NOTIFICATION_EVENT));
}

function defaultExtendedDate() {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const year = due.getFullYear();
  const month = String(due.getMonth() + 1).padStart(2, "0");
  const day = String(due.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Notifications() {
  const navigate = useNavigate();
  const notificationRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    const result = await api("/student-affairs/notifications");
    setItems(result.items);
    setUnreadCount(result.unread_count);
    notifyNavigation();
  }

  useEffect(() => {
    api("/student-affairs/notifications")
      .then((result) => {
        setItems(result.items);
        setUnreadCount(result.unread_count);
        notifyNavigation();
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!notificationRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  async function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    setError("");
    if (nextOpen) {
      try {
        await load();
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function openTask(item) {
    try {
      await api(`/student-affairs/notifications/${item.id}/read`, {
        method: "POST",
      });
      await load();
      setOpen(false);
      navigate(`/student-affairs?status=open&taskId=${item.task_id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="sa-notifications" ref={notificationRef}>
      <button type="button" className="sa-bell"
        aria-label={`Notifications, ${unreadCount} unread`} onClick={toggle}>
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="sa-unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="sa-notification-menu">
          <h3>Notifications</h3>
          {error && <p className="error" role="alert">{error}</p>}
          {items.length === 0 ? <p className="muted">No notifications yet.</p> : (
            items.map((item) => (
              <div key={item.id}
                className={`sa-notification ${item.is_red ? "red" : ""} ${item.read ? "read" : ""}`}>
                <span>{item.message}</span>
                <button type="button" className="sa-task-link"
                  onClick={() => openTask(item)}>Task</button>
                {!item.read && <strong>Unread</strong>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentAffairs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [role, setRole] = useState(localStorage.getItem("role"));
  const [teacherId, setTeacherId] = useState(localStorage.getItem("teacherId"));
  const [accountLoaded, setAccountLoaded] = useState(false);
  const isHod = ["admin", "hod"].includes(role);
  const isStudentAffairsManager = role === "student_affairs";
  const isTeacherAccount = role === "timetable";
  const isLinkedTeacher = !!teacherId;
  const canManageTasks = isHod || isStudentAffairsManager || isLinkedTeacher;
  const canCreateTasks = (isTeacherAccount || isStudentAffairsManager)
    && isLinkedTeacher;
  const taskId = searchParams.get("taskId");
  const requestedStatus = searchParams.get("status");
  const status = requestedStatus === "completed" ? "completed" : "open";
  const requestedView = searchParams.get("view");
  const view = requestedView
    || (taskId
      ? "open"
      : requestedStatus
        ? "open"
        : isStudentAffairsManager || canCreateTasks
        ? "create"
        : "open");
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({
    title: "",
    complaint_details: "",
    student_name: "",
    roll_number: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then((account) => {
        if (!active) return;
        setRole(account.role);
        setTeacherId(account.teacher_id ? String(account.teacher_id) : "");
        localStorage.setItem("role", account.role);
        localStorage.setItem(
          "teacherId",
          account.teacher_id ? String(account.teacher_id) : "",
        );
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setAccountLoaded(true);
      });
    return () => { active = false; };
  }, []);

  async function loadTasks(nextStatus = status) {
    setError("");
    try {
      const result = await api(
        `/student-affairs/tasks?status=${encodeURIComponent(nextStatus)}`,
      );
      setTasks(result);
      notifyNavigation();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    api(`/student-affairs/tasks?status=${encodeURIComponent(status)}`)
      .then((result) => {
        setTasks(result);
        notifyNavigation();
      })
      .catch((err) => setError(err.message));
  }, [status]);

  useEffect(() => {
    if (taskId) {
      document.getElementById(`student-affairs-task-${taskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [tasks, taskId]);

  async function createTask(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/student-affairs/tasks", {
        method: "POST",
        body: JSON.stringify(form),
      });
      navigate("/student-affairs?status=open&view=open", { replace: true });
      setForm({
        title: "",
        complaint_details: "",
        student_name: "",
        roll_number: "",
      });
      if (status === "open") {
        await loadTasks("open");
      } else {
        setSearchParams({ status: "open" });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(task) {
    const resolutionNote = window.prompt("Enter a short resolution note:");
    if (!resolutionNote?.trim()) return;
    try {
      await api(`/student-affairs/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ resolution_note: resolutionNote }),
      });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remindTeacher(task) {
    try {
      await api(`/student-affairs/tasks/${task.id}/remind`, { method: "POST" });
      setError("");
      window.alert("Reminder sent to the teacher.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function extendDeadline(task) {
    const dueDate = window.prompt(
      "Enter the extended deadline (YYYY-MM-DD):",
      defaultExtendedDate(),
    );
    if (!dueDate) return;
    try {
      await api(`/student-affairs/tasks/${task.id}/deadline`, {
        method: "PUT",
        body: JSON.stringify({ due_date: dueDate }),
      });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function softDelete(task) {
    if (!window.confirm(`Move "${task.title}" to removed tasks?`)) return;
    try {
      await api(`/student-affairs/tasks/${task.id}`, { method: "DELETE" });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="student-affairs">
      <header className="sa-header">
        <div>
          <h1>Student Affairs</h1>
          <p className="muted">
            Track student complaints, resolutions, and overdue follow-ups.
          </p>
        </div>
        {(isHod || isStudentAffairsManager || isLinkedTeacher) && <Notifications />}
      </header>

      {accountLoaded && isTeacherAccount && !isLinkedTeacher && (
        <p className="error" role="alert">
          Ask the HOD to link your login account to your teacher profile.
        </p>
      )}

      {view === "create" && !accountLoaded && (
        <div className="panel muted">Loading account...</div>
      )}

      {view === "create" && accountLoaded && canCreateTasks && (
        <form className="panel sa-create-form" onSubmit={createTask}>
          <h2>Create a new task</h2>
          <div className="sa-fields">
            <label>
              Task title
              <input required maxLength={160} value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Student name
              <input required maxLength={120} value={form.student_name}
                onChange={(event) => setForm({ ...form, student_name: event.target.value })} />
            </label>
            <label>
              Registration number
              <input required maxLength={80} value={form.roll_number}
                onChange={(event) => setForm({ ...form, roll_number: event.target.value })} />
            </label>
            <label className="sa-details-field">
              Complaint details
              <textarea required maxLength={10000} rows={3}
                value={form.complaint_details}
                onChange={(event) => setForm({
                  ...form,
                  complaint_details: event.target.value,
                })} />
            </label>
          </div>
          <p className="muted">The deadline is set automatically to 14 days from today.</p>
          <button type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create task"}
          </button>
        </form>
      )}

      {view === "create" && accountLoaded && !canCreateTasks && (
        <p className="panel muted">
          This account has no linked teacher profile. In Manage Users, edit this
          account and select its teacher profile. The display name alone does not
          create that link.
        </p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {view !== "create" && (
        <>
          <div className="sa-task-heading">
            <h2>{status === "open" ? "Open tasks" : "Completed tasks"}</h2>
          </div>
          {tasks.length === 0 ? (
            <div className="panel muted">No {status} tasks.</div>
          ) : (
            <div className="sa-task-list">
          {tasks.map((task) => (
            <article id={`student-affairs-task-${task.id}`}
              className={`panel sa-task ${task.escalated ? "escalated" : ""} ${String(task.id) === taskId ? "targeted" : ""}`}
              key={task.id}>
              <div className="sa-task-title">
                <div>
                  <h3>{task.title}</h3>
                  <p className="muted">
                    Student: {task.student_name} · Registration no: {task.roll_number}
                    {(isHod || isStudentAffairsManager)
                      && ` · Teacher: ${task.teacher_name}`}
                  </p>
                </div>
                <span className={`sa-status ${task.status}`}>
                  {task.escalated && task.status === "open" ? "Escalated" : task.status}
                </span>
              </div>
              <p className="sa-complaint">{task.complaint_details}</p>
              <p className="sa-task-meta">
                Created {task.created_at?.slice(0, 10)} · Due {task.due_date}
                {task.escalated && (
                  <strong className="sa-overdue">
                    {task.overdue_days} {task.overdue_days === 1 ? "day" : "days"} overdue
                  </strong>
                )}
              </p>
              {task.resolution_note && (
                <p className="sa-resolution">
                  <b>Resolution:</b> {task.resolution_note}
                </p>
              )}
              <div className="sa-task-actions">
                {canManageTasks && task.status === "open" && (
                  <button type="button" onClick={() => completeTask(task)}>
                    {isHod || isStudentAffairsManager
                      ? "Mark resolved"
                      : "Mark completed"}
                  </button>
                )}
                {(isHod || isStudentAffairsManager)
                  && task.escalated && task.status === "open" && (
                  <>
                    <button type="button" className="grey"
                      onClick={() => remindTeacher(task)}>Send reminder</button>
                    <button type="button" className="grey"
                      onClick={() => extendDeadline(task)}>Extend deadline</button>
                  </>
                )}
                {canManageTasks && (
                  <button type="button" className="danger"
                    onClick={() => softDelete(task)}>Remove</button>
                )}
              </div>
            </article>
          ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
