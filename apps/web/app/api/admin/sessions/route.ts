import { createSession, listOwnedSessions } from "@/lib/store";
import { handle, json, publicOrigin, readJson, requireName, requireUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  const userId = await requireUserId();
  return json({ sessions: await listOwnedSessions(publicOrigin(request), userId) });
});

export const POST = handle(async (request) => {
  const userId = await requireUserId();
  const body = await readJson<{ name?: string }>(request);
  const session = await createSession(publicOrigin(request), requireName(body.name), userId);
  return json({ session }, 201);
});
