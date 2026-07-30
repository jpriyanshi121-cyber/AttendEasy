const API_URL = import.meta.env.VITE_API_URL as string;

function getToken() {
  return localStorage.getItem("attendeasy_token");
}

function setToken(token: string) {
  localStorage.setItem("attendeasy_token", token);
}

function clearToken() {
  localStorage.removeItem("attendeasy_token");
}

async function request(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (networkErr) {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Database was likely asleep — wait a moment and retry once.
    if (res.status === 500 && !retried) {
      await new Promise((r) => setTimeout(r, 1500));
      return request(path, options, true);
    }
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  forgotPassword: (email: string) => request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  get: (path: string) => request(path),
  post: (path: string, body: any) => request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: any) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request(path, { method: "DELETE" }),
};

export { getToken, setToken, clearToken };