import { randomBytes, randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  clampLightingState,
  defaultLightingState,
  type LightingMode,
  type LightingState,
  type ScreenSummary,
  type SessionSummary,
  type SessionTarget,
  type StoredLightingState
} from "@softcast/protocol";
import { HttpError } from "@/lib/http";

type Hash = Record<string, string>;

let redis: Redis | null = null;

function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new HttpError(500, "Upstash Redis is not configured");
  redis = new Redis({ url, token });
  return redis;
}

function asInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new HttpError(500, "Unexpected Redis result");
  return parsed;
}

function asHash(value: unknown): Hash {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const hash: Hash = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry == null) continue;
    hash[key] = String(entry);
  }
  return hash;
}

function sessionUrl(origin: string, sessionId: string) {
  return `${origin}/session/${sessionId}`;
}

function screenUrl(origin: string, sessionId: string, screenId: string) {
  return `${origin}/screen/${sessionId}/${screenId}`;
}

function userSessionsKey(userId: string) { return `softcast:user:${userId}:sessions`; }
function sessionKey(sessionId: string) { return `softcast:session:${sessionId}`; }
function screensKey(sessionId: string) { return `softcast:session:${sessionId}:screens`; }
function screenPrefix(sessionId: string) { return `softcast:session:${sessionId}:screen:`; }
function screenKey(sessionId: string, screenId: string) { return `${screenPrefix(sessionId)}${screenId}`; }
function stateKey(sessionId: string, screenId: string) { return `${screenKey(sessionId, screenId)}:state`; }
function codeKey(code: string) { return `softcast:code:${code}`; }

function randomId() {
  return randomBytes(16).toString("base64url");
}

export async function pingRedis(timeoutMs = 1000) {
  return Promise.race([
    getRedis().ping(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis ping timed out")), timeoutMs))
  ]);
}

export async function listOwnedSessions(origin: string, userId: string) {
  const ids = await getRedis().zrange<string[]>(userSessionsKey(userId), 0, -1, { rev: true }) || [];
  const sessions: SessionSummary[] = [];

  for (const sessionId of ids) {
    const data = asHash(await getRedis().hgetall(sessionKey(sessionId)));
    if (!data.ownerId || data.ownerId !== userId) {
      await getRedis().zrem(userSessionsKey(userId), sessionId);
      continue;
    }
    sessions.push(await sessionSummary(origin, sessionId, data));
  }

  return sessions;
}

export async function createSession(origin: string, name: string, ownerId: string) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const sessionId = randomId();
    const createdAt = Date.now();
    const created = asInt(await getRedis().eval(
      `if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
       redis.call("HSET", KEYS[1], "ownerId", ARGV[1], "name", ARGV[2], "createdAt", ARGV[3])
       redis.call("ZADD", KEYS[2], ARGV[3], ARGV[4])
       return 1`,
      [sessionKey(sessionId), userSessionsKey(ownerId)],
      [ownerId, name, createdAt.toString(), sessionId]
    ));
    if (created === 1) return sessionSummary(origin, sessionId, { ownerId, name, createdAt: createdAt.toString() });
  }
  throw new HttpError(500, "Could not allocate session ID");
}

export async function createScreen(origin: string, sessionId: string, name: string, ownerId: string) {
  await assertSessionOwner(sessionId, ownerId);

  for (let attempts = 0; attempts < 10; attempts += 1) {
    const screenId = randomId();
    const createdAt = Date.now();
    const created = asInt(await getRedis().eval(
      `if redis.call("HGET", KEYS[1], "ownerId") ~= ARGV[1] then return -1 end
       if redis.call("EXISTS", KEYS[3]) == 1 then return 0 end
       redis.call("HSET", KEYS[3], "name", ARGV[2], "createdAt", ARGV[3])
       redis.call("ZADD", KEYS[2], ARGV[3], ARGV[4])
       redis.call("HSET", KEYS[4], "mode", ARGV[5], "temperature", ARGV[6], "hue", ARGV[7], "saturation", ARGV[8], "brightness", ARGV[9], "revision", 0, "updatedAt", ARGV[3])
       return 1`,
      [sessionKey(sessionId), screensKey(sessionId), screenKey(sessionId, screenId), stateKey(sessionId, screenId)],
      [
        ownerId,
        name,
        createdAt.toString(),
        screenId,
        defaultLightingState.mode,
        defaultLightingState.temperature.toString(),
        defaultLightingState.hue.toString(),
        defaultLightingState.saturation.toString(),
        defaultLightingState.brightness.toString()
      ]
    ));
    if (created === -1) throw new HttpError(403, "Not allowed to modify this session");
    if (created === 1) return screenSummary(origin, sessionId, screenId, { name, createdAt: createdAt.toString() });
  }
  throw new HttpError(500, "Could not allocate screen ID");
}

export async function deleteScreen(sessionId: string, screenId: string, ownerId: string) {
  const deleted = asInt(await getRedis().eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     if redis.call("EXISTS", KEYS[3]) == 0 then return 0 end
     redis.call("ZREM", KEYS[2], ARGV[2])
     redis.call("DEL", KEYS[3], KEYS[4])
     return 1`,
    [sessionKey(sessionId), screensKey(sessionId), screenKey(sessionId, screenId), stateKey(sessionId, screenId)],
    [ownerId, screenId]
  ));
  if (deleted === -2) throw new HttpError(404, "Session not found");
  if (deleted === -1) throw new HttpError(403, "Not allowed to modify this session");
  if (deleted === 0) throw new HttpError(404, "Screen not found");
}

export async function deleteSession(sessionId: string, ownerId: string) {
  const deleted = asInt(await getRedis().eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     local screens = redis.call("ZRANGE", KEYS[3], 0, -1)
     for _, screenId in ipairs(screens) do
       redis.call("DEL", ARGV[3] .. screenId, ARGV[3] .. screenId .. ":state")
     end
     redis.call("ZREM", KEYS[2], ARGV[2])
     redis.call("DEL", KEYS[1], KEYS[3])
     return 1`,
    [sessionKey(sessionId), userSessionsKey(ownerId), screensKey(sessionId)],
    [ownerId, sessionId, screenPrefix(sessionId)]
  ));
  if (deleted === -2) throw new HttpError(404, "Session not found");
  if (deleted === -1) throw new HttpError(403, "Not allowed to modify this session");
}

export async function setState(target: Required<SessionTarget>, state: LightingState, ownerId: string) {
  const revision = asInt(await getRedis().eval(
    `local actualOwner = redis.call("HGET", KEYS[1], "ownerId")
     if not actualOwner then return -2 end
     if actualOwner ~= ARGV[1] then return -1 end
     if redis.call("EXISTS", KEYS[2]) == 0 then return 0 end
     local revision = redis.call("HINCRBY", KEYS[2], "revision", 1)
     redis.call("HSET", KEYS[2], "mode", ARGV[2], "temperature", ARGV[3], "hue", ARGV[4], "saturation", ARGV[5], "brightness", ARGV[6], "updatedAt", ARGV[7])
     return revision`,
    [sessionKey(target.sessionId), stateKey(target.sessionId, target.screenId)],
    [
      ownerId,
      state.mode,
      state.temperature.toString(),
      state.hue.toString(),
      state.saturation.toString(),
      state.brightness.toString(),
      Date.now().toString()
    ]
  ));
  if (revision === -2) throw new HttpError(404, "Session not found");
  if (revision === -1) throw new HttpError(403, "Not allowed to modify this session");
  if (revision === 0) throw new HttpError(404, "Screen not found");
  return revision;
}

export async function sessionSummary(origin: string, sessionId: string, data?: Hash) {
  const stored = data || asHash(await getRedis().hgetall(sessionKey(sessionId)));
  if (!stored.ownerId) throw new HttpError(404, "Session not found");
  return {
    sessionId,
    name: stored.name || "Untitled session",
    sessionUrl: sessionUrl(origin, sessionId),
    createdAt: Number(stored.createdAt) || 0,
    screens: await readScreens(origin, sessionId)
  } satisfies SessionSummary;
}

export async function readScreens(origin: string, sessionId: string) {
  const ids = await getRedis().zrange<string[]>(screensKey(sessionId), 0, -1) || [];
  const screens: ScreenSummary[] = [];
  for (const screenId of ids) {
    const data = asHash(await getRedis().hgetall(screenKey(sessionId, screenId)));
    if (!data.name) continue;
    screens.push(screenSummary(origin, sessionId, screenId, data));
  }
  return screens;
}

function screenSummary(origin: string, sessionId: string, screenId: string, data: Hash) {
  return {
    screenId,
    name: data.name || "Untitled screen",
    screenUrl: screenUrl(origin, sessionId, screenId),
    createdAt: Number(data.createdAt) || 0
  } satisfies ScreenSummary;
}

export async function getState(target: Required<SessionTarget>) {
  const raw = asHash(await getRedis().hgetall(stateKey(target.sessionId, target.screenId)));
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

export async function newCode(target: SessionTarget) {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const code = randomInt(100000, 1000000).toString();
    const reserved = await getRedis().set(codeKey(code), JSON.stringify(target), { ex: 300, nx: true });
    if (reserved) return code;
  }
  throw new HttpError(500, "Could not allocate verification code");
}

export async function redeemCode(code: string) {
  const raw = await getRedis().getdel<string | SessionTarget>(codeKey(code));
  if (!raw) throw new HttpError(404, "Invalid or expired code");
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as SessionTarget;
}

export async function assertSession(sessionId: string) {
  if (!(await getRedis().exists(sessionKey(sessionId)))) throw new HttpError(404, "Session not found");
}

export async function assertSessionOwner(sessionId: string, userId: string) {
  const ownerId = await getRedis().hget<string>(sessionKey(sessionId), "ownerId");
  if (!ownerId) throw new HttpError(404, "Session not found");
  if (ownerId !== userId) throw new HttpError(403, "Not allowed to modify this session");
}

export async function assertScreen(sessionId: string, screenId: string) {
  if (!(await getRedis().exists(screenKey(sessionId, screenId)))) throw new HttpError(404, "Screen not found");
}
