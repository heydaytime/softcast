import { assertScreen, assertSession, getState } from "@/lib/store";
import { handle, json, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_request, { params }) => {
  const sessionId = await routeParam(params, "sessionId");
  const screenId = await routeParam(params, "screenId");
  await assertSession(sessionId);
  await assertScreen(sessionId, screenId);
  return json(await getState({ sessionId, screenId }));
});
