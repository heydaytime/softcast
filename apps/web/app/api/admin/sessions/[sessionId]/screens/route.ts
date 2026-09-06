import { createScreen } from "@/lib/store";
import { handle, json, publicOrigin, readJson, requireName, requireUserId, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (request, { params }) => {
  const userId = await requireUserId();
  const sessionId = await routeParam(params, "sessionId");
  const body = await readJson<{ name?: string }>(request);
  const screen = await createScreen(publicOrigin(request), sessionId, requireName(body.name), userId);
  return json({ screen }, 201);
});
