import { defaultLightingState } from "@softcast/protocol";

const base = process.env.BACKEND_URL || "http://localhost:4000";

async function main() {
  const session = await post<{ sessionId: string }>("/api/sessions", { name: "studio" });
  const sub = await post<{ subSessionId: string }>(`/api/sessions/${session.sessionId}/subsessions`, { name: "key light" });
  const code = await post<{ code: string }>("/api/codes", { sessionId: session.sessionId, subSessionId: sub.subSessionId });
  const redeemed = await post<{ sessionId: string; subSessionId: string }>("/api/codes/redeem", { code: code.code });
  if (redeemed.sessionId !== session.sessionId || redeemed.subSessionId !== sub.subSessionId) throw new Error("Redeemed code target mismatch");
  const update = { ...defaultLightingState, preset: "solid", mode: "creative", palette: "custom", colors: ["#ff0000"], brightness: 0.7 };
  await post(`/api/sessions/${session.sessionId}/state`, { subSessionId: sub.subSessionId, state: update });
  const state = await get<{ state: typeof update }>(`/api/sessions/${session.sessionId}/state?subSessionId=${sub.subSessionId}`);
  if (state.state.preset !== "solid" || state.state.colors[0] !== "#ff0000") throw new Error("State did not persist");
  console.log("Backend smoke test passed");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
