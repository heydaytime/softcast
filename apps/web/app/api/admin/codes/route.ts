import type { SessionTarget } from "@softcast/protocol";
import { assertScreen, assertSessionOwner, newCode } from "@/lib/store";
import { handle, json, readJson, requireString, requireUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (request) => {
  const userId = await requireUserId();
  const body = await readJson<SessionTarget>(request);
  const sessionId = requireString(body.sessionId, "sessionId");
  const screenId = body.screenId ? requireString(body.screenId, "screenId") : undefined;
  await assertSessionOwner(sessionId, userId);
  if (screenId) await assertScreen(sessionId, screenId);
  return json({ code: await newCode({ sessionId, screenId }) }, 201);
});
