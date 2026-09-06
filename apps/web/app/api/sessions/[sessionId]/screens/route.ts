import { assertSession, readScreens } from "@/lib/store";
import { handle, json, publicOrigin, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  const sessionId = await routeParam(params, "sessionId");
  await assertSession(sessionId);
  return json({ screens: await readScreens(publicOrigin(request), sessionId) });
});
