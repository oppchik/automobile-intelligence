import { load, save } from "./storage.js";

export function getSessionId() {
  let id = load("ai_session_id", null);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    save("ai_session_id", id);
  }
  return id;
}

export function getToken() {
  return load("ai_token", null);
}

export function setToken(token) {
  save("ai_token", token);
}

export function clearToken() {
  try {
    localStorage.removeItem("ai_token");
  } catch {
    return;
  }
}
