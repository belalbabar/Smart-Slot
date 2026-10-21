const API = import.meta.env.VITE_API_URL;

export async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    for (const key of ["token", "role", "username", "displayName", "teacherId"]) {
      localStorage.removeItem(key);
    }
    sessionStorage.removeItem("adminGate");
    sessionStorage.removeItem("adminReturnState");
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong");
  return data;
}