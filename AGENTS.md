# Softcast Agent Guide

This file is the operational source of truth for coding agents working in this repository. Read it before changing code. `README.md` describes the product; this file describes the invariants and working rules that must survive implementation changes.

## Non-Negotiable Working Rules

- Never run `bun run dev`, `bun run dev:all`, `bun run dev:web`, or `bun run dev:backend`.
- Never start, stop, restart, or kill the user's web, backend, or Redis processes unless the user explicitly asks for that exact process operation.
- The user owns the development server lifecycle and runs `bun run dev` themselves.
- Static commands are allowed: typechecks, builds, protocol smoke tests, `git diff --check`, and read-only inspection.
- Do not read or print `.env`, `.env.local`, Clerk secrets, Redis credentials, or bearer tokens. It is acceptable to check whether a variable is present without printing its value.
- Do not revert unrelated work. The repository may already have a dirty working tree.
- Use `apply_patch` for manual file edits.
- Use `rg` or `rg --files` for repository searches.

## Product Invariants

Softcast turns anonymous browser displays into controllable fill lights.

- A light has a `mode` (`cct` or `color`) plus `temperature`, `hue`, `saturation`, and normalized `brightness`.
- In `cct` mode the light shows white at `temperature` Kelvin; in `color` mode it shows the `hue`/`saturation` color. `brightness` applies in both modes.
- Valid ranges: `temperature` `1800`–`10000` Kelvin, `hue` `0`–`360`, `saturation` `0`–`1`, `brightness` `0`–`1`.
- The light renders a single static color or white. There are still no effects, animations, gradients, or scene/preset entries stored in the lighting state (CCT quick-picks and recents are client-side UI conveniences only).
- A root session groups screens but is not itself a light source.
- A screen belongs to exactly one session and owns exactly one current lighting state.
- Session and screen IDs are random identifiers. Display names are metadata and may duplicate.
- Use `screen` and `screenId` everywhere. Do not reintroduce `subsession`, `sub-session`, or `subSessionId` terminology.

## Repository Map

- `apps/web`: Next.js 16 App Router, React 19, Tailwind CSS v4, and Clerk UI integration.
- `services/backend`: Bun HTTP/WebSocket server, Clerk token verification, Redis persistence, and broadcasts.
- `packages/protocol`: shared state schemas, API/WebSocket DTOs, Kelvin conversion, and renderer HTML.
- `apps/web/app/admin/page.tsx`: authenticated owner console.
- `apps/web/lib/backend.ts`: typed HTTP boundary between the web app and backend.
- `apps/web/lib/use-softcast.ts`: anonymous, receive-only WebSocket subscription hook.
- `services/backend/src/index.ts`: current backend routes, authorization, Redis scripts, keys, and WebSocket topics.

## Authentication and Ownership

Clerk authenticates administrators. Redis is the authorization source of truth for Softcast resources.

- `/admin` is protected by Clerk in `apps/web/proxy.ts`.
- Client routes `/`, `/session/:sessionId`, and `/screen/:sessionId/:screenId` remain public.
- The browser obtains a Clerk session token with `useAuth().getToken()` and sends it as `Authorization: Bearer <token>` to the standalone backend.
- The backend independently authenticates every `/api/admin/*` request with `@clerk/backend` and `authenticateRequest()`.
- Token verification uses configured `authorizedParties` derived from allowed frontend origins.
- The backend derives the Clerk user ID from the verified token. Never accept `ownerId` from request JSON, URL parameters, local storage, or client state.
- `softcast:session:{sessionId}.ownerId` is authoritative.
- The per-user sessions sorted set is an index for discovery, not the authorization authority.
- Only the exact Clerk user who created a session may inspect its admin workspace or mutate the session, screens, state, or verification codes.
- There is no ownership sharing, transfer, organization ownership, or ownerless claiming flow.
- Return `401` when no valid Clerk identity exists and `403` when an authenticated user does not own the target session.
- Ownership checks for writes must occur inside the Redis transaction/Lua script that performs the write, preventing check/write races.

Anonymous clients are intentionally read-only:

- Anyone with a valid session or screen ID may subscribe and receive screen metadata or lighting state.
- Public WebSocket messages must never expose Clerk IDs or ownership metadata.
- WebSockets accept only `subscribe`; never add an unauthenticated write message such as `admin:update`.
- All state changes travel through authenticated HTTP and are broadcast to anonymous listeners afterward.

## Redis Data Model

Use the unversioned `softcast:` namespace. Do not add `softcast:v2`, compatibility readers, migration shims, or legacy aliases.

```text
softcast:user:{clerkUserId}:sessions
  ZSET: sessionId scored by createdAt

softcast:session:{sessionId}
  HASH: ownerId, name, createdAt

softcast:session:{sessionId}:screens
  ZSET: screenId scored by createdAt

softcast:session:{sessionId}:screen:{screenId}
  HASH: name, createdAt

softcast:session:{sessionId}:screen:{screenId}:state
  HASH: mode, temperature, hue, saturation, brightness, revision, updatedAt

softcast:session:{sessionId}:seq
  STRING: monotonically increasing WebSocket sequence

softcast:code:{sixDigitCode}
  STRING: JSON SessionTarget with a 300-second TTL
```

- Sessions and screens do not expire automatically. They persist until their owner deletes them.
- Verification codes are single-use through Redis `GETDEL` and expire after five minutes.
- Creating a session atomically writes the session hash and adds it to the owner's index.
- Creating a screen atomically writes screen metadata, adds the screen index entry, and creates default state.
- Deleting a screen removes its index entry, metadata hash, and state hash.
- Deleting a session removes its owner index entry, every screen and state key, the screen index, session hash, and sequence key.
- A code must be validated against the current session/screen keys when redeemed.
- Do not key sessions or screens by display name.

This schema intentionally replaced the previous model. Before validating it against a development Redis database that contains old Softcast keys, the user may run `redis-cli FLUSHALL`. Do not perform a Redis flush unless the user explicitly requests it.

Operational invariants for production (see `README.md` and `deploy/redis.conf`):

- Run exactly one backend instance. WebSocket subscribers and broadcasts live in process memory; multiple instances silently break fan-out until broadcasts move to Redis pub/sub.
- Redis durability is the only durability. Self-hosted Redis must run with AOF persistence and off-box backups; otherwise a restart loses all sessions, screens, and state.
- `GET /health` pings Redis and returns `503` when it is down. The backend drains WebSockets and quits Redis on `SIGTERM`/`SIGINT`.

## Backend API Boundary

Authenticated owner routes:

```text
GET    /api/admin/sessions
POST   /api/admin/sessions
DELETE /api/admin/sessions/:sessionId
POST   /api/admin/sessions/:sessionId/screens
DELETE /api/admin/sessions/:sessionId/screens/:screenId
PUT    /api/admin/sessions/:sessionId/screens/:screenId/state
POST   /api/admin/codes
```

Public routes:

```text
POST /api/codes/redeem
GET  /health
WS   /ws
```

- Do not create parallel legacy endpoints under `/api/sessions`.
- Keep CORS origins and Clerk `authorizedParties` aligned.
- Validate names as non-empty strings with a maximum of 80 characters.
- Clamp lighting state through `@softcast/protocol` before storing it.
- Admin workspace responses use shared `SessionSummary`, `ScreenSummary`, and `AdminWorkspace` types.

## Frontend Data Flow

The admin UI is a Redis-backed view, not the source of truth.

1. Clerk protects `/admin` and loads the authenticated user.
2. The page calls `GET /api/admin/sessions` with a fresh Clerk token.
3. Redis returns only sessions indexed to that user and still verifies each hash's `ownerId`.
4. Session and screen mutations return shared DTOs that update the local UI cache.
5. Screen state changes use authenticated `PUT` requests, coalesced so only one write is in flight at a time (the latest value always wins; the final value is sent on release). Never fire one request per pointer move.
6. The backend stores the state, increments its revision, and broadcasts the accepted state.
7. `useSoftcast` receives broadcasts and rejects stale sequence/revision numbers.

Important frontend rules:

- A page refresh or another signed-in device must reconstruct sessions and screens from Redis.
- Never persist the admin workspace only in React state or browser storage.
- Never authorize actions based on whether an item is present in the UI.
- Do not send Clerk tokens over WebSockets.
- Keep anonymous session/screen pages usable without Clerk.
- Distinguish API `401`/`403`/validation errors from backend connectivity errors.
- While the admin is actively editing a light, local optimistic state is the source of truth. The lighting `Slider`/`ColorWheel` are fully controlled, so do not let lagging WebSocket echoes overwrite them mid-edit (that is what stutters on remote links). Suppress echo-apply while writes are pending and reconcile to the server state once the write queue settles; reset that pipeline on screen switch.

## Shared Protocol

`packages/protocol/src/index.ts` owns cross-package contracts:

- `LightingState`
- `SessionTarget`
- `ScreenSummary`
- `SessionSummary`
- `AdminWorkspace`
- `ClientMessage` and `ServerMessage`
- `clampLightingState` / `defaultLightingState`
- Mode-aware color conversion: `kelvinToCssColor` (cct), `hsvToRgb` / `hsvToCssColor` (color), and `lightingCssColor` which resolves the active color for the current mode
- Fullscreen renderer HTML (mode-aware: white at the Kelvin value in `cct`, the hue/saturation color in `color`, brightness as a dimmer in both)

Change the protocol package first when altering a cross-boundary shape, then update backend and frontend consumers in the same change. Do not duplicate protocol interfaces locally.

The WebSocket protocol is receive-only from the client's perspective:

- Client: `{ type: "subscribe", target }`
- Server root update: `{ type: "screens", sessionId, screens, seq }`
- Server screen update: `{ type: "state", target, revision, state, seq }`
- Server failure: `{ type: "error", message, seq }`

## Environment and Clerk

- This project is linked to Clerk application `app_3FNlKv0uOdVJI7jDOPydle7VRA6`. It has **both** instances live:
  - **Development** (`ins_3FNlL1AiuSev7wQODfelj6TIaKa`): `pk_test`/`sk_test`, Frontend API on `…clerk.accounts.dev`. Used for local dev; keys live in `apps/web/.env.local` (root `.env.local` for the backend dev script).
  - **Production** (`ins_3FV6awoYEmN19KOllclkst1owfW`): `pk_live`/`sk_live`, custom domain `softcast.studio`, Frontend API `clerk.softcast.studio`, account portal `accounts.softcast.studio`. This is what `softcast.studio` (Vercel) and the Pi backend use in production.
- Enabled sign-in methods: **Email** (built-in) and **Google**. Apple is disabled. Google in production uses a self-managed GCP OAuth client (consent screen "External"+published, scopes `openid`/`email`/`profile`, redirect `https://clerk.softcast.studio/v1/oauth_callback`) — Clerk's shared dev Google creds do not carry to production.
- Next.js reads Clerk values from `apps/web/.env.local` (dev); the backend dev script loads the root `.env.local` with `--env-file=../../.env.local`.
- Production secrets live in the hosting environment, never in git: Vercel env store (frontend) and `/etc/softcast/backend.env` on the Pi (backend). See **Production Infrastructure**.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public. `CLERK_SECRET_KEY` is backend-only and must never appear in client code or logs.
- The backend needs both `CLERK_SECRET_KEY` and the Clerk publishable key: `authenticateRequest()` in `@clerk/backend` requires the publishable key to resolve the instance, or it throws "Publishable key is missing". The backend reads `CLERK_PUBLISHABLE_KEY` (falling back to `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`); the publishable key is public and safe in backend env.
- Other expected variables are documented in `.env.example`: backend URL, WebSocket URL, web URL, CORS origins, Redis URL, and port.
- For Clerk CLI work, run `clerk doctor --json` first and prefer the repository's Clerk skill instructions. `clerk deploy` (production setup) is interactive and must be run by the user in a real terminal; `clerk deploy status` and `clerk env pull --instance prod` are non-interactive and safe for an agent to run.

## Production Infrastructure

Production is **live**. Step-by-step runbook is in `deploy/DEPLOY.md`; this is the operational map.

```
Browser
  softcast.studio        → Vercel (frontend; auto-deploys on push to main)
  api.softcast.studio    → Cloudflare (proxied) → hdtrs (GCP edge Caddy) → [WireGuard] → Pi → Bun backend :4000 → Redis
  clerk.softcast.studio  → Clerk production Frontend API (DNS-only CNAMEs in Cloudflare)
```

Hosts (ssh aliases). Secrets are NOT stored in this file — ask the user for the Pi sudo password, Vercel token, or Cloudflare token when an operation needs one.

- `ssh pi` — Raspberry Pi (Ubuntu arm64), user `heyday`, reachable over WireGuard at `192.168.100.150`. Runs the backend. Has a sudo password (ask the user). `bun` is at `/home/heyday/.bun/bin/bun`.
- `ssh hdtrs` — GCP VM (Ubuntu x86_64), user `heyday`, public IP `34.29.172.203`, WireGuard client `10.44.0.4`, **passwordless sudo**. Public edge fronting `api.softcast.studio`. Its Caddy ALSO serves unrelated sites (`api.blendr.live`, `ai.heydaytime.net`).
- `ssh vpn2home` — GCP VM running the WireGuard **server** (`wg0` 10.44.0.1/24). `pi` and `hdtrs` are both clients. Normally untouched.

Pi backend:
- App dir `/home/heyday/softcast`, deployed by **rsync, not git** (`apps/` excluded). systemd unit `softcast-backend` (enabled on boot) runs `bun services/backend/src/index.ts`, binds `127.0.0.1:4000`. Env in `/etc/softcast/backend.env` (root:root `0600`, never in git; holds `pk_live`/`sk_live`, `PUBLIC_WEB_URL`, `CORS_ALLOWED_ORIGINS=https://softcast.studio`, `REDIS_URL`).
- Local Caddy `:80` (`deploy/Caddyfile`) → backend. `redis-server` with AOF persistence + `noeviction`, enabled on boot.
- Deploy backend changes: run `./deploy/deploy-to-pi.sh` from a local checkout (rsync + `bun install` + `systemctl restart softcast-backend`). There is no CI/CD for the backend.

hdtrs edge:
- One shared `/etc/caddy/Caddyfile` (also hosts other sites) — **APPEND, never overwrite**. The softcast block (`deploy/hdtrs-softcast.caddy`) is `api.softcast.studio { reverse_proxy 192.168.100.150:80 }`. Caddy auto-issues the Let's Encrypt cert; Cloudflare reaches the origin over HTTPS (Full mode). `reverse_proxy` forwards WebSocket upgrades through both Caddy hops, so `wss://api.softcast.studio/ws` works.

Cloudflare DNS (zone `softcast.studio`):
- `api` A → hdtrs public IP, **proxied (orange)**.
- `softcast.studio` → Vercel.
- Clerk records `clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey` → `*.clerk.services`, all **DNS only (grey)** — never proxy these or Clerk verification/TLS breaks.
- DNS edits need a Cloudflare API token (ask the user) or the user does them in the dashboard.

Vercel:
- Project `heydaytime/softcast`, auto-deploys on push to `main`; build config in `vercel.json`.
- Production env (in Vercel, never committed): `NEXT_PUBLIC_BACKEND_URL=https://api.softcast.studio`, `NEXT_PUBLIC_WS_URL=wss://api.softcast.studio/ws`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live), `CLERK_SECRET_KEY` (sk_live). `NEXT_PUBLIC_*` are inlined at build, so an env change requires a redeploy (push to `main`).
- Setting Vercel env / deploying needs CLI auth: prefer `vercel login` (browser); the globally-installed CLI is old and mishandles `VERCEL_TOKEN` for some commands.

## UI Direction

- The interface is a restrained, dark operational tool, not a marketing page.
- Use shared tokens from `apps/web/app/globals.css` and shared controls from `apps/web/lib/ui.tsx`.
- The client pairing page stays focused on one action: enter a verification code.
- The admin console uses stable navigation and workspace regions; creating sessions or screens must not cause major layout shifts. Regions hold a constant size across states (e.g. the verification panel reserves the code box and its action so generating a code never resizes the panel).
- The admin console is responsive. At ≥1280px it shows the three-pane layout (rail · controls · preview). Below 1280px it collapses to one pane navigated by a top Library/Control/Preview tab strip, with the active pane as the sole scroll region so nothing clips on narrow widths or when zoomed. Keep the ≥1280px layout unchanged when editing compact styles: gate compact-only rules with `max-xl:`, and a single SSR-safe `useMediaQuery` (`apps/web/lib/useMediaQuery.ts`) drives the branch.
- Every page shares the single fixed-height `SoftcastHeader` (`apps/web/lib/ui.tsx`); the brand sits left and the page action sits right. There is no per-page context/status chip in the header. The signed-in Clerk avatar is a fixed-size square (`UserButton` appearance override) and is always the right-most element.
- The Admin entry action is a red-tinted "Admin" link (subtle red border/background and red text with a shield glyph) — noticeable via the red accent but not a loud solid-red fill.
- Lighting controls expose a White/Color mode toggle: White mode is a CCT fader with quick-picks, Color mode is a hue/saturation color wheel, and a shared brightness fader applies to both. Recently-used swatches are a client-side convenience only.
- Fixed-format controls must remain bounded at their minimum and maximum values without overflowing or changing layout. Slider thumbs stay fully inside their track at both extremes.
- The public screen renderer is a display-only `iframe` with `pointer-events-none` so keyboard focus stays on the page (Enter/Space toggle the overlay, F toggles fullscreen) and taps fall through to the overlay toggle.

## Verification

Run these after relevant changes:

```bash
bun run typecheck
bun packages/protocol/src/smoke-test.ts
git diff --check
```

Production web verification without starting a server:

```bash
cd apps/web && bunx next build --webpack
```

The normal root build is `bun run build`. In restricted sandboxes, Turbopack may fail while trying to bind an internal worker port; `next build --webpack` is the accepted static fallback.

Backend smoke testing expects an already-running backend owned by the user:

- Without `BACKEND_AUTH_TOKEN`, it verifies the unauthenticated guard.
- With `BACKEND_AUTH_TOKEN`, it exercises owner creation, hydration, state, code redemption, and deletion.
- With `BACKEND_OTHER_AUTH_TOKEN`, it also verifies cross-user mutation returns `403`.
- Do not start the backend just to run this test. Ask the user to run the server if needed.

## Change Checklist

Before finishing a change, confirm:

- Admin writes require a verified Clerk user and exact Redis owner match.
- Anonymous clients can subscribe but cannot mutate.
- Session/screen metadata remains durable and reloadable.
- Redis keys remain under the unversioned `softcast:` namespace.
- No old `subSession` or `admin:update` terminology was reintroduced.
- Protocol, backend, and frontend agree on all DTOs.
- No secret was printed or moved into client code.
- No development server or user-owned process was started, stopped, or killed.
