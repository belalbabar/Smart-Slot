const API = import.meta.env.VITE_API_URL;

export async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  let res;
  try {
    res = await fetch(API + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the SmartSlot backend. Check that the backend server is running and the frontend API address is correct, then retry."
      );
    }
    throw error;
  }
  if (res.status === 401 && !path.startsWith("/auth/login")) {
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