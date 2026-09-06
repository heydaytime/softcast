import { deleteScreen } from "@/lib/store";
import { handle, json, requireUserId, routeParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (_request, { params }) => {
  const userId = await requireUserId();
  await deleteScreen(await routeParam(params, "sessionId"), await routeParam(params, "screenId"), userId);
  return json({ ok: true });
});
