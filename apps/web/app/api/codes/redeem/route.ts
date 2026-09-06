import type { RedeemedCode } from "@softcast/protocol";
import { assertScreen, assertSession, redeemCode } from "@/lib/store";
import { handle, json, publicOrigin, readJson, requireString } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (request) => {
  const body = await readJson<{ code?: string }>(request);
  const code = requireString(body.code, "code").toUpperCase();
  const target = await redeemCode(code);
  await assertSession(target.sessionId);
  if (target.screenId) await assertScreen(target.sessionId, target.screenId);
  const origin = publicOrigin(request);
  const redeemed: RedeemedCode = {
    ...target,
    sessionUrl: `${origin}/session/${target.sessionId}`,
    screenUrl: target.screenId ? `${origin}/screen/${target.sessionId}/${target.screenId}` : undefined
  };
  return json(redeemed);
});
