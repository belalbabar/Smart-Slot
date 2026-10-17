import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "./api";

export function useOverview(id) {
  const { loadSessions } = useOutletContext();
  const [data, setData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [error, setError] = useState("");

  async function loadTeachers() {
    setTeachers(await api("/teachers"));
  }
  async function load() {
    setData(await api(`/sessions/${id}/overview`));
    await loadTeachers();
  }

  useEffect(() => {
    setData(null);
    setError("");
    load().catch((e) => setError(e.message));
  }, [id]);

  async function run(fn) {
    setError("");
    try {
      await fn();
      await load();
      loadSessions();
    } catch (e) {
      setError(e.message);
    }
  }

  return { data, teachers, error, run, loadTeachers };
}