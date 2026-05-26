import { createHash, randomBytes, randomInt } from "node:crypto";
import type { ServerWebSocket } from "bun";
import Redis from "ioredis";
import {
  clampLightingState,
  defaultLightingState,
  type ClientMessage,
  type LightingState,
  type RedeemedCode,
  type ServerMessage,
  type SessionTarget,
  type StoredLightingState
} from "@softcast/protocol";

type SocketData = {
  sessionId?: string;
  targets: string[];
};

type OutgoingServerMessage =
  | { type: "state"; target: SessionTarget; revision: number; state: LightingState }
  | { type: "subsessions"; sessionId: string; subSessionIds: string[] }
  | { type: "error"; message: string };

const port = Number(process.env.PORT || 4000);
const hostname = process.env.HOST || "0.0.0.0";
const lanIp = process.env.SOFTCAST_LAN_IP;
const webOrigin = process.env.PUBLIC_WEB_URL || "http://localhost:3000";
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001,https://softcast.studio")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean));
const sessionTtlSeconds = 90 * 24 * 60 * 60;
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const socketsByTopic = new Map<string, Set<ServerWebSocket<SocketData>>>();

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
      const upgraded = server.upgrade(request, { data: { targets: [] } });
      return upgraded ? undefined : json({ error: "WebSocket upgrade failed" }, 400);
    }

    if (request.method === "OPTIONS") return cors(request);
    if (!isAllowedOrigin(request)) return json({ error: "Origin not allowed" }, 403, request);
    if (url.pathname === "/health") return json({ ok: true }, 200, request);

    try {
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const body = await request.json() as { name?: string };
        const name = requireString(body.name, "name");
        const sessionId = await createSession(name);
        return json({ sessionId, sessionUrl: sessionUrl(sessionId) }, 200, request);
      }

      const subSessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/subsessions$/);
      if (request.method === "POST" && subSessionMatch) {
        const sessionId = subSessionMatch[1]!;
        const body = await request.json() as { name?: string };
        const name = requireString(body.name, "name");
        await assertSession(sessionId);
        const subSessionId = stableId(`sub:${sessionId}:${normalizeName(name)}`);
        await redis.sadd(subSessionsKey(sessionId), subSessionId);
        await ensureState({ sessionId, subSessionId });
        await expireWithSession(sessionId, [subSessionsKey(sessionId), subStateKey(sessionId, subSessionId), revisionKey(sessionId, subSessionId)]);
        await broadcast(sessionId, sessionTopic(sessionId), { type: "subsessions", sessionId, subSessionIds: await subSessions(sessionId) });
        return json({ subSessionId, screenUrl: screenUrl(sessionId, subSessionId) }, 200, request);
      }

      const singleSubSessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/subsessions\/([^/]+)$/);
      if (request.method === "DELETE" && singleSubSessionMatch) {
        const sessionId = singleSubSessionMatch[1]!;
        const subSessionId = singleSubSessionMatch[2]!;
        await assertSession(sessionId);
        await assertSubSession(sessionId, subSessionId);
        await redis.srem(subSessionsKey(sessionId), subSessionId);
        await redis.del(subStateKey(sessionId, subSessionId), revisionKey(sessionId, subSessionId));
        await broadcast(sessionId, sessionTopic(sessionId), { type: "subsessions", sessionId, subSessionIds: await subSessions(sessionId) });
        await broadcast(sessionId, screenTopic(sessionId, subSessionId), { type: "error", message: "Screen deleted" });
        return json({ ok: true }, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/codes") {
        const body = await request.json() as SessionTarget;
        const sessionId = requireString(body.sessionId, "sessionId");
        await assertSession(sessionId);
        if (body.subSessionId) await assertSubSession(sessionId, body.subSessionId);
        const code = await newCode({ sessionId, subSessionId: body.subSessionId });
        return json({ code }, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/codes/redeem") {
        const body = await request.json() as { code?: string };
        const code = requireString(body.code, "code").toUpperCase();
        const raw = await redis.getdel(codeKey(code));
        if (!raw) return json({ error: "Invalid or expired code" }, 404, request);
        const target = JSON.parse(raw) as SessionTarget;
        const redeemed: RedeemedCode = {
          ...target,
          sessionUrl: sessionUrl(target.sessionId),
          screenUrl: target.subSessionId ? screenUrl(target.sessionId, target.subSessionId) : undefined
        };
        return json(redeemed, 200, request);
      }

      const stateMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/state$/);
      if (request.method === "GET" && stateMatch) {
        const sessionId = stateMatch[1]!;
        const subSessionId = requireString(url.searchParams.get("subSessionId"), "subSessionId");
        await assertSession(sessionId);
        await assertSubSession(sessionId, subSessionId);
        const stored = await getState({ sessionId, subSessionId });
        return json({ state: stored.state, revision: stored.revision }, 200, request);
      }

      if (request.method === "POST" && stateMatch) {
        const sessionId = stateMatch[1]!;
        const body = await request.json() as { subSessionId?: string; state?: LightingState };
        await assertSession(sessionId);
        const subSessionId = requireString(body.subSessionId, "subSessionId");
        await assertSubSession(sessionId, subSessionId);
        const state = clampLightingState(body.state || defaultLightingState);
        const target = { sessionId, subSessionId };
        const revision = await setState(target, state);
        await emitState(target, revision, state);
        return json({ ok: true, state, revision }, 200, request);
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        const sessionId = sessionMatch[1]!;
        await assertSession(sessionId);
        return json({ sessionId, sessionUrl: sessionUrl(sessionId), subSessionIds: await subSessions(sessionId) }, 200, request);
      }

      if (request.method === "DELETE" && sessionMatch) {
        const sessionId = sessionMatch[1]!;
        const subs = await subSessions(sessionId);
        await redis.del(sessionKey(sessionId), subSessionsKey(sessionId), sequenceKey(sessionId), ...subs.flatMap((id) => [subStateKey(sessionId, id), revisionKey(sessionId, id)]));
        await broadcast(sessionId, sessionTopic(sessionId), { type: "error", message: "Session deleted" });
        return json({ ok: true }, 200, request);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`${request.method} ${url.pathname} failed: ${message}`);
      return json({ error: message }, message.includes("not found") ? 404 : 400, request);
    }

    return json({ error: "Not found" }, 404, request);
  },
  websocket: {
    async message(ws, raw) {
      try {
        const message = JSON.parse(String(raw)) as ClientMessage;
        if (message.type === "subscribe") {
          await assertSession(message.target.sessionId);
          if (message.target.subSessionId) await assertSubSession(message.target.sessionId, message.target.subSessionId);
          ws.data.sessionId = message.target.sessionId;
          subscribe(ws, sessionTopic(message.target.sessionId));
          await send(ws, message.target.sessionId, { type: "subsessions", sessionId: message.target.sessionId, subSessionIds: await subSessions(message.target.sessionId) });
          if (message.target.subSessionId) {
            subscribe(ws, screenTopic(message.target.sessionId, message.target.subSessionId));
            const stored = await getState(message.target);
            await send(ws, message.target.sessionId, { type: "state", target: message.target, revision: stored.revision, state: stored.state });
          }
          return;
        }

        if (message.type === "admin:update") {
          await assertSession(message.target.sessionId);
          const subSessionId = requireString(message.target.subSessionId, "subSessionId");
          await assertSubSession(message.target.sessionId, subSessionId);
          const state = clampLightingState(message.state);
          const target = { sessionId: message.target.sessionId, subSessionId };
          const revision = await setState(target, state);
          await emitState(target, revision, state);
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid socket message";
        await send(ws, ws.data.sessionId, { type: "error", message });
      }
    },
    close(ws) {
      for (const topic of ws.data.targets) socketsByTopic.get(topic)?.delete(ws);
    }
  }
});

console.log(`Softcast backend listening on http://localhost:${server.port}`);
if (lanIp) console.log(`Softcast phone backend URL http://${lanIp}:${server.port}`);

function subscribe(ws: ServerWebSocket<SocketData>, topic: string) {
  if (!socketsByTopic.has(topic)) socketsByTopic.set(topic, new Set());
  socketsByTopic.get(topic)!.add(ws);
  if (!ws.data.targets.includes(topic)) ws.data.targets.push(topic);
}

async function send(ws: ServerWebSocket<SocketData>, sessionId: string | undefined, message: OutgoingServerMessage) {
  const seq = await nextSeq(sessionId);
  ws.send(JSON.stringify({ ...message, seq } satisfies ServerMessage));
}

async function broadcast(sessionId: string, topic: string, message: OutgoingServerMessage) {
  const seq = await nextSeq(sessionId);
  const sequenced = JSON.stringify({ ...message, seq } satisfies ServerMessage);
  for (const ws of socketsByTopic.get(topic) || []) ws.send(sequenced);
}

async function emitState(target: SessionTarget, revision: number, state: LightingState) {
  if (!target.subSessionId) throw new Error("subSessionId is required");
  await broadcast(target.sessionId, screenTopic(target.sessionId, target.subSessionId), { type: "state", target, revision, state });
}

async function newCode(target: SessionTarget) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const code = randomInt(100000, 999999).toString();
    const reserved = await redis.set(codeKey(code), JSON.stringify(target), "EX", 300, "NX");
    if (reserved) return code;
  }
  throw new Error("Could not allocate verification code");
}

async function createSession(name: string) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const sessionId = randomId();
    const created = await redis.hsetnx(sessionKey(sessionId), "createdAt", Date.now().toString());
    if (created) {
      await redis.hset(sessionKey(sessionId), { name });
      await redis.expire(sessionKey(sessionId), sessionTtlSeconds);
      return sessionId;
    }
  }
  throw new Error("Could not allocate session ID");
}

async function expireWithSession(sessionId: string, keys: string[]) {
  const ttl = await redis.ttl(sessionKey(sessionId));
  if (ttl <= 0) throw new Error("Session expired");
  const pipeline = redis.pipeline();
  for (const key of keys) pipeline.expire(key, ttl);
  await pipeline.exec();
}

function randomId() {
  return randomBytes(16).toString("base64url");
}

async function assertSession(sessionId: string) {
  if (!(await redis.exists(sessionKey(sessionId)))) throw new Error("Session not found");
}

async function assertSubSession(sessionId: string, subSessionId: string) {
  if (!(await redis.sismember(subSessionsKey(sessionId), subSessionId))) throw new Error("Sub session not found");
}

async function ensureState(target: SessionTarget) {
  if (!target.subSessionId) throw new Error("subSessionId is required");
  const key = subStateKey(target.sessionId, target.subSessionId);
  await redis.set(key, JSON.stringify({ revision: 0, state: defaultLightingState } satisfies StoredLightingState), "NX");
}

async function getState(target: SessionTarget) {
  if (!target.subSessionId) throw new Error("subSessionId is required");
  const key = subStateKey(target.sessionId, target.subSessionId);
  const raw = await redis.get(key);
  if (!raw) return { revision: 0, state: defaultLightingState } satisfies StoredLightingState;
  const parsed = JSON.parse(raw) as StoredLightingState | LightingState;
  if ("state" in parsed && "revision" in parsed) return { revision: parsed.revision, state: clampLightingState(parsed.state) };
  return { revision: 0, state: clampLightingState(parsed as LightingState) };
}

async function setState(target: SessionTarget, state: LightingState) {
  if (!target.subSessionId) throw new Error("subSessionId is required");
  const key = subStateKey(target.sessionId, target.subSessionId);
  const revision = await redis.eval(
    `if redis.call("EXISTS", KEYS[1]) == 0 then return nil end
     local revision = redis.call("INCR", KEYS[3])
     redis.call("SET", KEYS[2], '{"revision":' .. revision .. ',"state":' .. ARGV[1] .. '}')
     return revision`,
    3,
    sessionKey(target.sessionId),
    key,
    revisionKey(target.sessionId, target.subSessionId),
    JSON.stringify(state)
  ) as number | null;
  if (!revision) throw new Error("Session not found");
  await expireWithSession(target.sessionId, [key, revisionKey(target.sessionId, target.subSessionId)]);
  return revision;
}

async function nextSeq(sessionId?: string) {
  const key = sequenceKey(sessionId || "global");
  const seq = await redis.incr(key);
  if (sessionId) await expireWithSession(sessionId, [key]);
  return seq;
}

async function subSessions(sessionId: string) {
  return (await redis.smembers(subSessionsKey(sessionId))).sort();
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function stableId(input: string) {
  return createHash("sha256").update(input).digest("base64url").slice(0, 22);
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
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
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
  if (allowedOrigins.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

function sessionKey(sessionId: string) { return `softcast:session:${sessionId}`; }
function subSessionsKey(sessionId: string) { return `softcast:session:${sessionId}:subs`; }
function subStateKey(sessionId: string, subSessionId: string) { return `softcast:session:${sessionId}:sub:${subSessionId}:state`; }
function codeKey(code: string) { return `softcast:code:${code}`; }
function revisionKey(sessionId: string, subSessionId: string) { return `softcast:session:${sessionId}:sub:${subSessionId}:revision`; }
function sequenceKey(sessionId: string) { return `softcast:session:${sessionId}:seq`; }
function sessionTopic(sessionId: string) { return `session:${sessionId}`; }
function screenTopic(sessionId: string, subSessionId: string) { return `session:${sessionId}:sub:${subSessionId}`; }
function sessionUrl(sessionId: string) { return `${webOrigin}/session/${sessionId}`; }
function screenUrl(sessionId: string, subSessionId: string) { return `${webOrigin}/screen/${sessionId}/${subSessionId}`; }
