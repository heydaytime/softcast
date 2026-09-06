import { clampLightingState, defaultLightingState, type LightingState } from "@softcast/protocol";
import { setState } from "@/lib/store";
import { handle, json, readJson, requireUserId, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const PUT = handle(async (request, { params }) => {
  const userId = await requireUserId();
  const sessionId = await routeParam(params, "sessionId");
  const screenId = await routeParam(params, "screenId");
  const body = await readJson<{ state?: LightingState }>(request);
  const state = clampLightingState(body.state || defaultLightingState);
  const revision = await setState({ sessionId, screenId }, state, userId);
  return json({ state, revision });
});
