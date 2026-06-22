import type { AdminWorkspace, LightingState, RedeemedCode, ScreenSummary, SessionSummary, SessionTarget } from "@softcast/protocol";

const production = process.env.NODE_ENV === "production";
export const backendUnavailableMessage = "Softcast backend is unavailable. Check that api.softcast.studio is online and try again.";
export const websocketUnavailableMessage = "Softcast backend connection is unavailable. Check that api.softcast.studio is online and try again.";

export const backendConfigError = production && !process.env.NEXT_PUBLIC_BACKEND_URL
  ? "NEXT_PUBLIC_BACKEND_URL is not configured. Set it to https://api.softcast.studio in Vercel."
  : "";

export const wsConfigError = production && !process.env.NEXT_PUBLIC_WS_URL
  ? "NEXT_PUBLIC_WS_URL is not configured. Set it to wss://api.softcast.studio/ws in Vercel."
  : "";

export const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (production ? "" : "http://localhost:4000");
export const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (production ? "" : "ws://localhost:4000/ws");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (backendConfigError) throw new Error(backendConfigError);
  let response: Response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
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

function withAuth(init: RequestInit, token: string | null) {
  if (!token) throw new ApiError(401, "Authentication required");
  return {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${token}` }
  };
}

export function isBackendUnavailableMessage(message: string) {
  return message === backendUnavailableMessage || message === websocketUnavailableMessage || message.includes("NEXT_PUBLIC_BACKEND_URL") || message.includes("NEXT_PUBLIC_WS_URL");
}

export function getAdminWorkspace(token: string | null) {
  return api<AdminWorkspace>("/api/admin/sessions", withAuth({ method: "GET" }, token));
}

export function createSession(name: string, token: string | null) {
  return api<{ session: SessionSummary }>("/api/admin/sessions", withAuth({ method: "POST", body: JSON.stringify({ name }) }, token));
}

export function deleteSession(sessionId: string, token: string | null) {
  return api<{ ok: true }>(`/api/admin/sessions/${sessionId}`, withAuth({ method: "DELETE" }, token));
}

export function createScreen(sessionId: string, name: string, token: string | null) {
  return api<{ screen: ScreenSummary }>(`/api/admin/sessions/${sessionId}/screens`, withAuth({ method: "POST", body: JSON.stringify({ name }) }, token));
}

export function deleteScreen(sessionId: string, screenId: string, token: string | null) {
  return api<{ ok: true }>(`/api/admin/sessions/${sessionId}/screens/${screenId}`, withAuth({ method: "DELETE" }, token));
}

export function createCode(target: SessionTarget, token: string | null) {
  return api<{ code: string }>("/api/admin/codes", withAuth({ method: "POST", body: JSON.stringify(target) }, token));
}

export function redeemCode(code: string) {
  return api<RedeemedCode>("/api/codes/redeem", { method: "POST", body: JSON.stringify({ code }) });
}

export function updateState(sessionId: string, screenId: string, state: LightingState, token: string | null) {
  return api<{ state: LightingState; revision: number }>(
    `/api/admin/sessions/${sessionId}/screens/${screenId}/state`,
    withAuth({ method: "PUT", body: JSON.stringify({ state }) }, token)
  );
}
