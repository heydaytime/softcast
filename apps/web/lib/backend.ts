import type { AdminWorkspace, LightingState, RedeemedCode, ScreenSummary, SessionSummary, SessionTarget, StoredLightingState } from "@softcast/protocol";

export const backendUnavailableMessage = "Softcast backend is unavailable. Check your connection and try again.";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) }
    });
  } catch {
    throw new Error(backendUnavailableMessage);
  }

  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    if (response.status >= 500 && !payload?.error) throw new Error(backendUnavailableMessage);
    throw new ApiError(response.status, payload?.error || response.statusText);
  }
  return payload as T;
}

export function isBackendUnavailableMessage(message: string) {
  return message === backendUnavailableMessage;
}

export function getAdminWorkspace() {
  return api<AdminWorkspace>("/api/admin/sessions", { method: "GET" });
}

export function createSession(name: string) {
  return api<{ session: SessionSummary }>("/api/admin/sessions", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteSession(sessionId: string) {
  return api<{ ok: true }>(`/api/admin/sessions/${sessionId}`, { method: "DELETE" });
}

export function createScreen(sessionId: string, name: string) {
  return api<{ screen: ScreenSummary }>(`/api/admin/sessions/${sessionId}/screens`, { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteScreen(sessionId: string, screenId: string) {
  return api<{ ok: true }>(`/api/admin/sessions/${sessionId}/screens/${screenId}`, { method: "DELETE" });
}

export function createCode(target: SessionTarget) {
  return api<{ code: string }>("/api/admin/codes", { method: "POST", body: JSON.stringify(target) });
}

export function redeemCode(code: string) {
  return api<RedeemedCode>("/api/codes/redeem", { method: "POST", body: JSON.stringify({ code }) });
}

export function updateState(sessionId: string, screenId: string, state: LightingState) {
  return api<{ state: LightingState; revision: number }>(
    `/api/admin/sessions/${sessionId}/screens/${screenId}/state`,
    { method: "PUT", body: JSON.stringify({ state }) }
  );
}

export function getSessionScreens(sessionId: string) {
  return api<{ screens: ScreenSummary[] }>(`/api/sessions/${sessionId}/screens`);
}

export function getScreenState(sessionId: string, screenId: string) {
  return api<StoredLightingState>(`/api/sessions/${sessionId}/screens/${screenId}/state`);
}
