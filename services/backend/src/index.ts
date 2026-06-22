import { randomBytes, randomInt } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { createClerkClient } from "@clerk/backend";
import Redis from "ioredis";
import {
  clampLightingState,
  defaultLightingState,
  type ClientMessage,
  type LightingMode,
  type LightingState,
  type RedeemedCode,
  type ScreenSummary,
  type ServerMessage,
  type SessionSummary,
  type SessionTarget,
  type StoredLightingState
} from "@softcast/protocol";

type SocketData = {
  sessionId?: string;
  topics: string[];
};

type OutgoingServerMessage =
  | { type: "state"; target: SessionTarget; revision: number; state: LightingState }
  | { type: "screens"; sessionId: string; screens: ScreenSummary[] }
  | { type: "error"; message: string };

const port = Number(process.env.PORT || 4000);
const hostname = process.env.HOST || "0.0.0.0";
const lanIp = process.env.SOFTCAST_LAN_IP;
const webOrigin = process.env.PUBLIC_WEB_URL || "http://localhost:3000";
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001,https://softcast.studio")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean));
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const socketsByTopic = new Map<string, Set<ServerWebSocket<SocketData>>>();
let globalSequence = 0;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const server = Bun.serve<SocketData>({
  port,
  hostname,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname === "/ws") {
      console.log(`${request.method} ${url.pathname}`);
    }

    if (url.pathname === "/ws") {
      if (!isAllowedOrigin(request)) return json({ error: "Origin not allowed" }, 403, request);
      const upgraded = server.upgrade(request, { data: { topics: [] } });
      return upgraded ? undefined : json({ error: "WebSocket upgrade failed" }, 400, request);
    }

    if (request.method === "OPTIONS") return cors(request);
    // Health checks from a load balancer carry no Origin header, which isAllowedOrigin
    // permits. Report unhealthy (503) when Redis is unreachable so the LB can react.
    if (url.pathname === "/health") {
      try {
        await pingRedis();
        return json({ ok: true }, 200, request);
      } catch {
        return json({ ok: false }, 503, request);
      }
    }
    if (!isAllowedOrigin(request)) return json({ error: "Origin not allowed" }, 403, request);

    try {
      if (url.pathname === "/api/admin/sessions") {
        const userId = await requireUserId(request);

        if (request.method === "GET") {
          return json({ sessions: await listOwnedSessions(userId) }, 200, request);
        }

        if (request.method === "POST") {
          const body = await readJson<{ name?: string }>(request);
          const session = await createSession(requireName(body.name), userId);
          return json({ session }, 201, request);
        }
      }

      const adminScreenMatch = url.pathname.match(/^\/api\/admin\/sessions\/([^/]+)\/screens$/);
      if (request.method === "POST" && adminScreenMatch) {
        const sessionId = adminScreenMatch[1]!;
        const userId = await requireUserId(request);
        const body = await readJson<{ name?: string }>(request);
        const screen = await createScreen(sessionId, requireName(body.name), userId);
        await broadcastScreens(sessionId);
        return json({ screen }, 201, request);
      }

      const adminSingleScreenMatch = url.pathname.match(/^\/api\/admin\/sessions\/([^/]+)\/screens\/([^/]+)$/);
      if (request.method === "DELETE" && adminSingleScreenMatch) {
        const sessionId = adminSingleScreenMatch[1]!;
        const screenId = adminSingleScreenMatch[2]!;
        const userId = await requireUserId(request);
        await deleteScreen(sessionId, screenId, userId);
        await broadcast(sessionId, screenTopic(sessionId, screenId), { type: "error", message: "Screen deleted" });
        await broadcastScreens(sessionId);
        return json({ ok: true }, 200, request);
      }

      const adminStateMatch = url.pathname.match(/^\/api\/admin\/sessions\/([^/]+)\/screens\/([^/]+)\/state$/);
      if (request.method === "PUT" && adminStateMatch) {
        const sessionId = adminStateMatch[1]!;
        const screenId = adminStateMatch[2]!;
        const userId = await requireUserId(request);
        const body = await readJson<{ state?: LightingState }>(request);
        const state = clampLightingState(body.state || defaultLightingState);
        const revision = await setState({ sessionId, screenId }, state, userId);
        await emitState({ sessionId, screenId }, revision, state);
        return json({ state, revision }, 200, request);
      }

      const adminSessionMatch = url.pathname.match(/^\/api\/admin\/sessions\/([^/]+)$/);
      if (request.method === "DELETE" && adminSessionMatch) {
        const sessionId = adminSessionMatch[1]!;
        const userId = await requireUserId(request);
        await assertSessionOwner(sessionId, userId);
        await broadcast(sessionId, sessionTopic(sessionId), { type: "error", message: "Session deleted" });
        await deleteSession(sessionId, userId);
        return json({ ok: true }, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/codes") {
        const userId = await requireUserId(request);
        const body = await readJson<SessionTarget>(request);
        const sessionId = requireString(body.sessionId, "sessionId");
        const screenId = body.screenId ? requireString(body.screenId, "screenId") : undefined;
        const target = { sessionId, screenId };
        await assertSessionOwner(sessionId, userId);
        if (screenId) await assertScreen(sessionId, screenId);
        return json({ code: await newCode(target) }, 201, request);
      }

      if (request.method === "POST" && url.pathname === "/api/codes/redeem") {
        const body = await readJson<{ code?: string }>(request);
        const code = requireString(body.code, "code").toUpperCase();
        const raw = await redis.getdel(codeKey(code));
        if (!raw) throw new HttpError(404, "Invalid or expired code");
        const target = JSON.parse(raw) as SessionTarget;
        await assertSession(target.sessionId);
        if (target.screenId) await assertScreen(target.sessionId, target.screenId);
        const redeemed: RedeemedCode = {
          ...target,
          sessionUrl: sessionUrl(target.sessionId),
          screenUrl: target.screenId ? screenUrl(target.sessionId, target.screenId) : undefined
        };
        return json(redeemed, 200, request);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`${request.method} ${url.pathname} failed: ${message}`);
      return json({ error: message }, error instanceof HttpError ? error.status : 500, request);
    }

    return json({ error: "Not found" }, 404, request);
  },
  websocket: {
    async message(ws, raw) {
      try {
        const message = JSON.parse(String(raw)) as ClientMessage;
        if (message.type !== "subscribe") throw new HttpError(400, "Unsupported WebSocket message");

        const sessionId = requireString(message.target.sessionId, "sessionId");
        const screenId = message.target.screenId ? requireString(message.target.screenId, "screenId") : undefined;
        await assertSession(sessionId);
        ws.data.sessionId = sessionId;
        subscribe(ws, sessionTopic(sessionId));

        if (!screenId) {
          await send(ws, sessionId, { type: "screens", sessionId, screens: await readScreens(sessionId) });
          return;
        }

        await assertScreen(sessionId, screenId);
        subscribe(ws, screenTopic(sessionId, screenId));
        const stored = await getState({ sessionId, screenId });
        await send(ws, sessionId, { type: "state", target: { sessionId, screenId }, revision: stored.revision, state: stored.state });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid WebSocket message";
        await send(ws, ws.data.sessionId, { type: "error", message });
      }
    },
    close(ws) {
      for (const topic of ws.data.topics) socketsByTopic.get(topic)?.delete(ws);
    }
  }
});

console.log(`Softcast backend listening on http://localhost:${server.port}`);
if (lanIp) console.log(`Softcast phone backend URL http://${lanIp}:${server.port}`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down`);
  try {
    server.stop();
    for (const subscribers of socketsByTopic.values()) {
      for (const ws of subscribers) {
        try { ws.close(1001, "Server shutting down"); } catch { /* already closing */ }
      }
    }
    await redis.quit();
  } catch (error) {
    console.error(`Shutdown error: ${error instanceof Error ? error.message : "unknown"}`);
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

async function pingRedis(timeoutMs = 1000) {
  return Promise.race([
    redis.ping(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis ping timed out")), timeoutMs))
  ]);
}

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerkClient() {
  if (clerkClient) return clerkClient;
  const secretKey = process.env.CLERK_SECRET_KEY;
  // authenticateRequest() in @clerk/backend requires BOTH the secret and the
  // publishable key to resolve the instance. The publishable key is public.
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey) throw new HttpError(500, "CLERK_SECRET_KEY is not configured");
  if (!publishableKey) throw new HttpError(500, "CLERK_PUBLISHABLE_KEY is not configured");
  clerkClient = createClerkClient({ secretKey, publishableKey });
  return clerkClient;
}

async function requireUserId(request: Request) {
  try {
    const requestState = await getClerkClient().authenticateRequest(request, {
      authorizedParties: [...allowedOrigins]
    });
    const userId = requestState.toAuth()?.userId;
    if (!userId) throw new HttpError(401, "Authentication required");
    return userId;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Surface the underlying Clerk error instead of silently masking it as a 401.
    console.error(`Clerk authentication failed: ${error instanceof Error ? error.message : "unknown error"}`);
    throw new HttpError(401, "Invalid authentication token");
  }
}

async function listOwnedSessions(userId: string) {
  const ids = await redis.zrevrange(userSessionsKey(userId), 0, -1);
  const sessions: SessionSummary[] = [];

  for (const sessionId of ids) {
    const data = await redis.hgetall(sessionKey(sessionId));
    if (!data.ownerId || data.ownerId !== userId) {
      await redis.zrem(userSessionsKey(userId), sessionId);
      continue;
    }
    sessions.push(await sessionSummary(sessionId, data));
  }

  return sessions;
}

async function createSession(name: string, ownerId: string) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const sessionId = randomId();
    const createdAt = Date.now();
    const created = await redis.eval(
      `if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
       redis.call("HSET", KEYS[1], "ownerId", ARGV[1], "name", ARGV[2], "createdAt", ARGV[3])
       redis.call("ZADD", KEYS[2], ARGV[3], ARGV[4])
       return 1`,
      2,
      sessionKey(sessionId),
      userSessionsKey(ownerId),
      ownerId,
      name,
      createdAt.toString(),
      sessionId
    ) as number;
    if (created === 1) return sessionSummary(sessionId, { ownerId, name, createdAt: createdAt.toString() });
  }
  throw new HttpError(500, "Could not allocate session ID");
}

async function createScreen(sessionId: string, name: string, ownerId: string) {
  await assertSessionOwner(sessionId, ownerId);

  for (let attempts = 0; attempts < 10; attempts += 1) {
    const screenId = randomId();
    const createdAt = Date.now();
    const created = await redis.eval(
      `if redis.call("HGET", KEYS[1], "ownerId") ~= ARGV[1] then return -1 end
       if redis.call("EXISTS", KEYS[3]) == 1 then return 0 end
       redis.call("HSET", KEYS[3], "name", ARGV[2], "createdAt", ARGV[3])
       redis.call("ZADD", KEYS[2], ARGV[3], ARGV[4])
       redis.call("HSET", KEYS[4], "mode", ARGV[5], "temperature", ARGV[6], "hue", ARGV[7], "saturation", ARGV[8], "brightness", ARGV[9], "revision", 0, "updatedAt", ARGV[3])
       return 1`,
      4,
      sessionKey(sessionId),
      screensKey(sessionId),
      screenKey(sessionId, screenId),
      stateKey(sessionId, screenId),
      ownerId,
      name,
      createdAt.toString(),
      screenId,
      defaultLightingState.mode,
      defaultLightingState.temperature.toString(),
      defaultLightingState.hue.toString(),
      defaultLightingState.saturation.toString(),
      defaultLightingState.brightness.toString()
    ) as number;
    if (created === -1) throw new HttpError(403, "Not allowed to modify this session");
    if (created === 1) return screenSummary(sessionId, screenId, { name, createdAt: createdAt.toString() });
  }
  throw new HttpError(500, "Could not allocate screen ID");
}

async function deleteScreen(sessionId: string, screenId: string, ownerId: string) {
  const deleted = await redis.eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     if redis.call("EXISTS", KEYS[3]) == 0 then return 0 end
     redis.call("ZREM", KEYS[2], ARGV[2])
     redis.call("DEL", KEYS[3], KEYS[4])
     return 1`,
    4,
    sessionKey(sessionId),
    screensKey(sessionId),
    screenKey(sessionId, screenId),
    stateKey(sessionId, screenId),
    ownerId,
    screenId
  ) as number;
  if (deleted === -2) throw new HttpError(404, "Session not found");
  if (deleted === -1) throw new HttpError(403, "Not allowed to modify this session");
  if (deleted === 0) throw new HttpError(404, "Screen not found");
}

async function deleteSession(sessionId: string, ownerId: string) {
  const deleted = await redis.eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     local screens = redis.call("ZRANGE", KEYS[3], 0, -1)
     for _, screenId in ipairs(screens) do
       redis.call("DEL", ARGV[3] .. screenId, ARGV[3] .. screenId .. ":state")
     end
     redis.call("ZREM", KEYS[2], ARGV[2])
     redis.call("DEL", KEYS[1], KEYS[3], KEYS[4])
     return 1`,
    4,
    sessionKey(sessionId),
    userSessionsKey(ownerId),
    screensKey(sessionId),
    sequenceKey(sessionId),
    ownerId,
    sessionId,
    screenPrefix(sessionId)
  ) as number;
  if (deleted === -2) throw new HttpError(404, "Session not found");
  if (deleted === -1) throw new HttpError(403, "Not allowed to modify this session");
}

async function setState(target: Required<SessionTarget>, state: LightingState, ownerId: string) {
  const revision = await redis.eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     if redis.call("EXISTS", KEYS[2]) == 0 then return 0 end
     local revision = redis.call("HINCRBY", KEYS[2], "revision", 1)
     redis.call("HSET", KEYS[2], "mode", ARGV[2], "temperature", ARGV[3], "hue", ARGV[4], "saturation", ARGV[5], "brightness", ARGV[6], "updatedAt", ARGV[7])
     return revision`,
    2,
    sessionKey(target.sessionId),
    stateKey(target.sessionId, target.screenId),
    ownerId,
    state.mode,
    state.temperature.toString(),
    state.hue.toString(),
    state.saturation.toString(),
    state.brightness.toString(),
    Date.now().toString()
  ) as number;
  if (revision === -2) throw new HttpError(404, "Session not found");
  if (revision === -1) throw new HttpError(403, "Not allowed to modify this session");
  if (revision === 0) throw new HttpError(404, "Screen not found");
  return revision;
}

async function sessionSummary(sessionId: string, data?: Record<string, string>) {
  const stored = data || await redis.hgetall(sessionKey(sessionId));
  if (!stored.ownerId) throw new HttpError(404, "Session not found");
  return {
    sessionId,
    name: stored.name || "Untitled session",
    sessionUrl: sessionUrl(sessionId),
    createdAt: Number(stored.createdAt) || 0,
    screens: await readScreens(sessionId)
  } satisfies SessionSummary;
}

async function readScreens(sessionId: string) {
  const ids = await redis.zrange(screensKey(sessionId), 0, -1);
  const screens: ScreenSummary[] = [];
  for (const screenId of ids) {
    const data = await redis.hgetall(screenKey(sessionId, screenId));
    if (!data.name) continue;
    screens.push(screenSummary(sessionId, screenId, data));
  }
  return screens;
}

function screenSummary(sessionId: string, screenId: string, data: Record<string, string>) {
  return {
    screenId,
    name: data.name || "Untitled screen",
    screenUrl: screenUrl(sessionId, screenId),
    createdAt: Number(data.createdAt) || 0
  } satisfies ScreenSummary;
}

async function getState(target: Required<SessionTarget>) {
  const raw = await redis.hgetall(stateKey(target.sessionId, target.screenId));
  if (!raw.revision) {
    return { revision: 0, state: defaultLightingState } satisfies StoredLightingState;
  }
  return {
    revision: Number(raw.revision) || 0,
    state: clampLightingState({
      mode: raw.mode as LightingMode | undefined,
      temperature: Number(raw.temperature),
      hue: Number(raw.hue),
      saturation: Number(raw.saturation),
      brightness: Number(raw.brightness)
    })
  } satisfies StoredLightingState;
}

async function newCode(target: SessionTarget) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const code = randomInt(100000, 1000000).toString();
    const reserved = await redis.set(codeKey(code), JSON.stringify(target), "EX", 300, "NX");
    if (reserved) return code;
  }
  throw new HttpError(500, "Could not allocate verification code");
}

async function assertSession(sessionId: string) {
  if (!(await redis.exists(sessionKey(sessionId)))) throw new HttpError(404, "Session not found");
}

async function assertSessionOwner(sessionId: string, userId: string) {
  const ownerId = await redis.hget(sessionKey(sessionId), "ownerId");
  if (!ownerId) throw new HttpError(404, "Session not found");
  if (ownerId !== userId) throw new HttpError(403, "Not allowed to modify this session");
}

async function assertScreen(sessionId: string, screenId: string) {
  if (!(await redis.exists(screenKey(sessionId, screenId)))) throw new HttpError(404, "Screen not found");
}

async function broadcastScreens(sessionId: string) {
  await broadcast(sessionId, sessionTopic(sessionId), { type: "screens", sessionId, screens: await readScreens(sessionId) });
}

async function emitState(target: Required<SessionTarget>, revision: number, state: LightingState) {
  await broadcast(target.sessionId, screenTopic(target.sessionId, target.screenId), { type: "state", target, revision, state });
}

function subscribe(ws: ServerWebSocket<SocketData>, topic: string) {
  if (!socketsByTopic.has(topic)) socketsByTopic.set(topic, new Set());
  socketsByTopic.get(topic)!.add(ws);
  if (!ws.data.topics.includes(topic)) ws.data.topics.push(topic);
}

async function send(ws: ServerWebSocket<SocketData>, sessionId: string | undefined, message: OutgoingServerMessage) {
  const seq = await nextSeq(sessionId);
  ws.send(JSON.stringify({ ...message, seq } satisfies ServerMessage));
}

async function broadcast(sessionId: string, topic: string, message: OutgoingServerMessage) {
  const subscribers = socketsByTopic.get(topic);
  if (!subscribers?.size) return;
  const seq = await nextSeq(sessionId);
  const serialized = JSON.stringify({ ...message, seq } satisfies ServerMessage);
  for (const ws of subscribers) ws.send(serialized);
}

async function nextSeq(sessionId?: string) {
  return sessionId ? redis.incr(sequenceKey(sessionId)) : ++globalSequence;
}

async function readJson<T>(request: Request) {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function requireName(value: unknown) {
  const name = requireString(value, "name");
  if (name.length > 80) throw new HttpError(400, "name must be 80 characters or fewer");
  return name;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  return value.trim();
}

function randomId() {
  return randomBytes(16).toString("base64url");
}

function json(body: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(request) }
  });
}

function cors(request: Request) {
  return new Response(null, { status: isAllowedOrigin(request) ? 204 : 403, headers: corsHeaders(request) });
}

function corsHeaders(request?: Request) {
  const origin = request?.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  };
  if (allowedOrigins.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

function userSessionsKey(userId: string) { return `softcast:user:${userId}:sessions`; }
function sessionKey(sessionId: string) { return `softcast:session:${sessionId}`; }
function screensKey(sessionId: string) { return `softcast:session:${sessionId}:screens`; }
function screenPrefix(sessionId: string) { return `softcast:session:${sessionId}:screen:`; }
function screenKey(sessionId: string, screenId: string) { return `${screenPrefix(sessionId)}${screenId}`; }
function stateKey(sessionId: string, screenId: string) { return `${screenKey(sessionId, screenId)}:state`; }
function codeKey(code: string) { return `softcast:code:${code}`; }
function sequenceKey(sessionId: string) { return `softcast:session:${sessionId}:seq`; }
function sessionTopic(sessionId: string) { return `session:${sessionId}`; }
function screenTopic(sessionId: string, screenId: string) { return `session:${sessionId}:screen:${screenId}`; }
function sessionUrl(sessionId: string) { return `${webOrigin}/session/${sessionId}`; }
function screenUrl(sessionId: string, screenId: string) { return `${webOrigin}/screen/${sessionId}/${screenId}`; }
