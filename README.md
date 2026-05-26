# softcast

Browser-native lighting surfaces controlled from the web. A client device can be any browser-capable display: TV, iPad, phone, laptop, projector, etc. Admins create Redis-backed sessions, generate one-time verification codes, and push lighting effects to root sessions or individual sub-sessions/screens.

## Monorepo

- `apps/web`: Next.js 16 + Tailwind v4 app for `softcast.studio`.
- `packages/protocol`: shared TypeScript protocol and lighting state types.
- `services/backend`: Bun HTTP + native WebSocket server for `api.softcast.studio`. Redis is the only storage layer.

## MVP Rules

- Admin sessions are anonymous and unauthenticated.
- Client screens are anonymous. Anyone with a root session link or screen link can listen.
- One-time verification codes only redirect/link a client to a root session or a specific sub-session, and expire after 5 minutes.
- Redis stores sessions, sub-sessions, verification codes, and current lighting state.
- Root session IDs are randomly generated and unique per created session.
- Sub-session IDs are deterministic from `root session ID + local screen name`.
- Admin session and screen names are kept in memory on the admin page only.

## Local Setup

Copy `.env.example` into the relevant app env files as needed.

```bash
bun install
bun run dev:backend
bun run dev:web
```

Run backend and web together:

```bash
bun run dev:all
```

Redis is expected at `redis://localhost:6379` by default.

## Backend API

- `POST /api/sessions` with `{ name }`
- `POST /api/sessions/:sessionId/subsessions` with `{ name }`
- `POST /api/codes` with `{ sessionId, subSessionId? }`
- `POST /api/codes/redeem` with `{ code }`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/state?subSessionId=...`
- `POST /api/sessions/:sessionId/state` with `{ subSessionId, state }`
- `DELETE /api/sessions/:sessionId`
- `WS /ws`

## Web Routes

- `/`: client-first verification code screen.
- `/admin`: admin console for sessions, screens, codes, and effects.
- `/session/:sessionId`: root session screen selector. This is not a light source and has no lighting state.
- `/screen/:sessionId/:subSessionId`: fullscreen lighting surface.

## Lighting Library

Modes:

- Studio
- Ambient
- Creative
- Dynamic
- Scenes

Preset definitions live in `packages/protocol`, which is shared by the frontend and backend through `@softcast/protocol`. The frontend renders the available modes and presets from that package, and the backend validates incoming lighting state with the same package before storing it in Redis.

## Notes

The frontend can deploy to Vercel at `softcast.studio`. The Bun WebSocket backend should deploy to a persistent runtime at `api.softcast.studio`, such as Railway, Fly.io, Render, or a VPS. Vercel should not host the long-lived Bun socket server.
