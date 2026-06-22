import { defaultLightingState, type AdminWorkspace, type ScreenSummary, type SessionSummary } from "@softcast/protocol";

const base = process.env.BACKEND_URL || "http://localhost:4000";
const authToken = process.env.BACKEND_AUTH_TOKEN;
const otherAuthToken = process.env.BACKEND_OTHER_AUTH_TOKEN;

async function main() {
  const unauthenticated = await fetch(`${base}/api/admin/sessions`);
  if (unauthenticated.status !== 401) throw new Error(`Unauthenticated admin list should return 401, got ${unauthenticated.status}`);

  if (!authToken) {
    console.log("Backend smoke test passed unauthenticated guard. Set BACKEND_AUTH_TOKEN to run the owner flow.");
    return;
  }

  const created = await request<{ session: SessionSummary }>("/api/admin/sessions", {
    method: "POST",
    token: authToken,
    body: { name: "studio" }
  });
  const session = created.session;

  const screenCreated = await request<{ screen: ScreenSummary }>(`/api/admin/sessions/${session.sessionId}/screens`, {
    method: "POST",
    token: authToken,
    body: { name: "key light" }
  });
  const screen = screenCreated.screen;

  const workspace = await request<AdminWorkspace>("/api/admin/sessions", { method: "GET", token: authToken });
  const hydrated = workspace.sessions.find((item) => item.sessionId === session.sessionId);
  if (hydrated?.screens[0]?.screenId !== screen.screenId || hydrated.screens[0].name !== "key light") {
    throw new Error("Owner workspace did not persist the created screen");
  }

  if (otherAuthToken) {
    const forbidden = await fetch(`${base}/api/admin/sessions/${session.sessionId}/screens/${screen.screenId}/state`, {
      method: "PUT",
      headers: authHeaders(otherAuthToken),
      body: JSON.stringify({ state: defaultLightingState })
    });
    if (forbidden.status !== 403) throw new Error(`Non-owner update should return 403, got ${forbidden.status}`);
  }

  const update = { ...defaultLightingState, temperature: 4300, brightness: 0.7 };
  const updated = await request<{ state: typeof update }>(`/api/admin/sessions/${session.sessionId}/screens/${screen.screenId}/state`, {
    method: "PUT",
    token: authToken,
    body: { state: update }
  });
  if (updated.state.temperature !== 4300 || updated.state.brightness !== 0.7) throw new Error("State did not persist");

  const colorUpdate = { ...defaultLightingState, mode: "color" as const, hue: 200, saturation: 0.8, brightness: 0.5 };
  const colorUpdated = await request<{ state: typeof colorUpdate }>(`/api/admin/sessions/${session.sessionId}/screens/${screen.screenId}/state`, {
    method: "PUT",
    token: authToken,
    body: { state: colorUpdate }
  });
  if (colorUpdated.state.mode !== "color" || colorUpdated.state.hue !== 200 || colorUpdated.state.saturation !== 0.8) throw new Error("Color state did not persist");

  const generated = await request<{ code: string }>("/api/admin/codes", {
    method: "POST",
    token: authToken,
    body: { sessionId: session.sessionId, screenId: screen.screenId }
  });
  const redeemed = await request<{ sessionId: string; screenId: string }>("/api/codes/redeem", {
    method: "POST",
    body: { code: generated.code }
  });
  if (redeemed.sessionId !== session.sessionId || redeemed.screenId !== screen.screenId) throw new Error("Redeemed code target mismatch");

  await request(`/api/admin/sessions/${session.sessionId}`, { method: "DELETE", token: authToken });
  const afterDelete = await request<AdminWorkspace>("/api/admin/sessions", { method: "GET", token: authToken });
  if (afterDelete.sessions.some((item) => item.sessionId === session.sessionId)) throw new Error("Deleted session remained in owner workspace");
  console.log("Backend owner smoke test passed");
}

async function request<T = { ok: true }>(path: string, options: { method: string; token?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: options.method,
    headers: options.token ? authHeaders(options.token) : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
