# softcast

Browser-native lighting surfaces controlled from the web. A client device can be any browser-capable display: TV, iPad, phone, laptop, projector, etc. Admins create Redis-backed sessions, generate one-time verification codes, and push color temperature and brightness to individual screens.

## Monorepo

- `apps/web`: Next.js 16 + Tailwind v4 app for `softcast.studio`. The HTTP API lives here as Route Handlers.
- `packages/protocol`: shared TypeScript protocol and lighting state types.

## Rules

- Admin access is authenticated with Clerk.
- Client screens are anonymous. Anyone with a root session link or screen link can listen.
- Sessions are owned by the Clerk user that created them.
- Admin mutation commands require the owning Clerk user.
- One-time verification codes only redirect/link a client to a root session or a specific screen, and expire after 5 minutes.
- Upstash Redis stores Clerk ownership, the owner's session index, sessions, screens, verification codes, and current lighting state.
- Root session IDs are randomly generated and unique per created session.
- Screen IDs are randomly generated and unique per created screen.
- Session and screen display names are durable Redis metadata.
- Sessions and screens persist until their owning Clerk user deletes them.
- The admin workspace is reconstructed from Redis after refresh or sign-in on another device.

## Local Setup

Copy `.env.example` into `apps/web/.env.local` and fill Clerk plus Upstash Redis values.

```bash
bun install
bun run dev
```

Clerk is required for admin access. Upstash Redis is required for every API route.

## API

Authenticated owner API (same origin, Clerk session cookie):

- `GET /api/admin/sessions`
- `POST /api/admin/sessions` with `{ name }`
- `DELETE /api/admin/sessions/:sessionId`
- `POST /api/admin/sessions/:sessionId/screens` with `{ name }`
- `DELETE /api/admin/sessions/:sessionId/screens/:screenId`
- `PUT /api/admin/sessions/:sessionId/screens/:screenId/state` with `{ state }`
- `POST /api/admin/codes` with `{ sessionId, screenId? }`

Public client API:

- `POST /api/codes/redeem` with `{ code }`
- `GET /api/sessions/:sessionId/screens`
- `GET /api/sessions/:sessionId/screens/:screenId/state`
- `GET /api/health`

Every admin endpoint reads the Clerk user from the session (`auth()`). Session mutations additionally compare that user ID to the `ownerId` stored in the session hash. Displays poll the public GET routes about twice a second and apply a payload when `revision` increases.

## Redis Keys

- `softcast:user:{clerkUserId}:sessions`: sorted index of sessions owned by a Clerk user.
- `softcast:session:{sessionId}`: session hash containing `ownerId`, `name`, and `createdAt`.
- `softcast:session:{sessionId}:screens`: sorted index of screens in a session.
- `softcast:session:{sessionId}:screen:{screenId}`: screen name and creation metadata.
- `softcast:session:{sessionId}:screen:{screenId}:state`: mode, temperature, hue, saturation, brightness, revision, and update time.
- `softcast:code:{code}`: one-time target with a five-minute TTL.

## Web Routes

- `/`: client-first verification code screen.
- `/admin`: Clerk-protected admin console for sessions, screens, codes, color temperature, and brightness. Responsive: a three-pane layout on wide screens that collapses to a tabbed single-pane layout (Library / Control / Preview) on phones and narrow/zoomed windows.
- `/session/:sessionId`: root session screen selector. This is not a light source and has no lighting state.
- `/screen/:sessionId/:screenId`: fullscreen lighting surface.

## Lighting Controls

Softcast supports a single fill-light state with a White/Color mode:

- `mode`: `cct` (white) or `color`.
- `temperature`: Kelvin value from `1800` to `10000` (used in `cct` mode).
- `hue`: `0` to `360`, and `saturation`: `0` to `1` (used in `color` mode).
- `brightness`: normalized value from `0` to `1`, displayed in the UI as `0` to `100`. Applies in both modes.

The admin controller offers a vertical CCT fader with standard quick-picks (white mode), a hue/saturation color wheel (color mode), a shared brightness fader, and recently-used swatches (a client-side convenience). Dragging a control updates the admin UI instantly from local state and pushes coalesced live updates (one write in flight at a time, latest value wins).

The shared `@softcast/protocol` package owns the lighting state schema, default state, clamping, Kelvin and HSV color conversion, and fullscreen renderer HTML. The frontend sends this state from the admin controller, and the server validates it before storing it in Redis.

## Production

`softcast.studio` is a Vercel Next.js app (UI and `/api/*`). Redis is Upstash. See `deploy/DEPLOY.md`.

`GET /api/health` pings Redis and returns `503` when it is unreachable.
