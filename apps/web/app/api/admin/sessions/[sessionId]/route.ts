import { deleteSession } from "@/lib/store";
import { handle, json, requireUserId, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (_request, { params }) => {
  const userId = await requireUserId();
  await deleteSession(await routeParam(params, "sessionId"), userId);
  return json({ ok: true });
});
