import type { LightingState, RedeemedCode, SessionTarget } from "@softcast/protocol";

export const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
export const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || response.statusText);
  return response.json() as Promise<T>;
}

export function createSession(name: string) {
  return api<{ sessionId: string; sessionUrl: string }>("/api/sessions", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteSession(sessionId: string) {
  return api<{ ok: true }>(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

export function createSubSession(sessionId: string, name: string) {
  return api<{ subSessionId: string; screenUrl: string }>(`/api/sessions/${sessionId}/subsessions`, { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteSubSession(sessionId: string, subSessionId: string) {
  return api<{ ok: true }>(`/api/sessions/${sessionId}/subsessions/${subSessionId}`, { method: "DELETE" });
}

export function createCode(target: SessionTarget) {
  return api<{ code: string }>("/api/codes", { method: "POST", body: JSON.stringify(target) });
}

export function redeemCode(code: string) {
  return api<RedeemedCode>("/api/codes/redeem", { method: "POST", body: JSON.stringify({ code }) });
}

export function updateState(sessionId: string, state: LightingState, subSessionId?: string) {
  return api<{ ok: true; state: LightingState; revision: number }>(`/api/sessions/${sessionId}/state`, { method: "POST", body: JSON.stringify({ subSessionId, state }) });
}
