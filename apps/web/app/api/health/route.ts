import { handle, json } from "@/lib/http";
import { pingRedis } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  try {
    await pingRedis();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
});
