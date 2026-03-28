const AUTH_URL = "https://functions.poehali.dev/fc5e421f-5972-492b-8bf4-7bb0503c7288";

export interface User {
  id: number;
  username: string;
  display_name: string;
}

async function callAuth(body: object): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error || "Ошибка сервера" };
  return { data };
}

export async function register(username: string, display_name: string, password: string) {
  return callAuth({ action: "register", username, display_name, password });
}

export async function login(username: string, password: string) {
  return callAuth({ action: "login", username, password });
}

export async function logout(token: string) {
  return callAuth({ action: "logout", token });
}

export async function getMe(token: string) {
  return callAuth({ action: "me", token });
}

export function saveSession(token: string, user: User) {
  localStorage.setItem("sc_token", token);
  localStorage.setItem("sc_user", JSON.stringify(user));
}

export function loadSession(): { token: string; user: User } | null {
  const token = localStorage.getItem("sc_token");
  const userStr = localStorage.getItem("sc_user");
  if (!token || !userStr) return null;
  try {
    return { token, user: JSON.parse(userStr) };
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("sc_token");
  localStorage.removeItem("sc_user");
}