# Softcast Agent Guide

This file is the operational source of truth for coding agents working in this repository. Read it before changing code. `README.md` describes the product; this file describes the invariants and working rules that must survive implementation changes.

## Non-Negotiable Working Rules

- Never run `bun run dev` or `bun run dev:web`.
- Never start, stop, restart, or kill the user's web process unless the user explicitly asks for that exact process operation.
- The user owns the development server lifecycle and runs `bun run dev` themselves.
- Static commands are allowed: typechecks, builds, protocol smoke tests, `git diff --check`, and read-only inspection.
- Do not read or print `.env`, `.env.local`, Clerk secrets, Redis credentials, or bearer tokens. It is acceptable to check whether a variable is present without printing its value.
- Do not revert unrelated work. The repository may already have a dirty working tree.
- Use `apply_patch` for manual file edits.
- Use `rg` or `rg --files` for repository searches.
- Always commit finished work before replying to the user. Do not end a turn with uncommitted project changes unless the user said not to commit, or the only remaining files are secrets / unrelated leftovers.

## Product Invariants

Softcast turns anonymous browser displays into controllable fill lights.

- A light has a `mode` (`cct` or `color`) plus `temperature`, `hue`, `saturation`, and normalized `brightness`.
- In `cct` mode the light shows white at `temperature` Kelvin; in `color` mode it shows the `hue`/`saturation` color. `brightness` applies in both modes.
- Valid ranges: `temperature` `1800`–`10000` Kelvin, `hue` `0`–`360`, `saturation` `0`–`1`, `brightness` `0`–`1`.
- The light renders a single static color or white. There are no effects, animations, gradients, or scene/preset entries stored in the lighting state (CCT quick-picks and recents are client-side UI conveniences only).
- A root session groups screens but is not itself a light source.
- A screen belongs to exactly one session and owns exactly one current lighting state.
- Session and screen IDs are random identifiers. Display names are metadata and may duplicate.
- Use `screen` and `screenId` for lighting surfaces.

## Repository Map

- `apps/web`: Next.js 16 App Router, React 19, Tailwind CSS v4, Clerk, and the HTTP API (Route Handlers).
- `packages/protocol`: shared state schemas, API DTOs, Kelvin conversion, and renderer HTML.
- `apps/web/app/admin/page.tsx`: authenticated owner console.
- `apps/web/lib/backend.ts`: typed same-origin HTTP client.
- `apps/web/lib/use-softcast.ts`: anonymous poll hook for screen lists and lighting state.
- `apps/web/lib/store.ts`: Redis keys, Lua ownership scripts, and Upstash access.
- `apps/web/app/api/**`: routes, authorization, and health.

## Authentication and Ownership

Clerk authenticates administrators. Redis is the authorization source of truth for Softcast resources.

- `/admin` is protected by Clerk in `apps/web/proxy.ts`.
- Client routes `/`, `/session/:sessionId`, and `/screen/:sessionId/:screenId` remain public.
- Admin API routes use `auth()` from `@clerk/nextjs/server` and the same-origin Clerk session cookie.
- The server derives the Clerk user ID from the verified session. Never accept `ownerId` from request JSON, URL parameters, local storage, or client state.
- `softcast:session:{sessionId}.ownerId` is authoritative.
- The per-user sessions sorted set is an index for discovery, not the authorization authority.
- Only the exact Clerk user who created a session may inspect its admin workspace or mutate the session, screens, state, or verification codes.
- There is no ownership sharing, transfer, organization ownership, or ownerless claiming flow.
- Return `401` when no valid Clerk identity exists and `403` when an authenticated user does not own the target session.
- Ownership checks for writes must occur inside the Redis transaction/Lua script that performs the write, preventing check/write races.
- Keep `auth.protect()` on `/admin` pages only. Admin `/api/*` handlers return JSON 401/403 themselves.

Anonymous clients are read-only:

- Anyone with a valid session or screen ID may poll and receive screen metadata or lighting state.
- Public API responses must never expose Clerk IDs or ownership metadata.
- All state changes travel through authenticated HTTP. Displays learn about them by polling.

## Redis Data Model

Keys use the `softcast:` prefix.

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

softcast:code:{sixDigitCode}
  STRING: JSON SessionTarget with a 300-second TTL
```

- Sessions and screens do not expire automatically. They persist until their owner deletes them.
- Verification codes are single-use through Redis `GETDEL` and expire after five minutes.
- Creating a session atomically writes the session hash and adds it to the owner's index.
- Creating a screen atomically writes screen metadata, adds the screen index entry, and creates default state.
- Deleting a screen removes its index entry, metadata hash, and state hash.
- Deleting a session removes its owner index entry, every screen and state key, the screen index, and the session hash.
- A code must be validated against the current session/screen keys when redeemed.
- Do not key sessions or screens by display name.

Use `@upstash/redis` over REST (`KV_REST_API_URL` / `KV_REST_API_TOKEN`, or the equivalent `UPSTASH_REDIS_REST_*` pair).

`GET /api/health` pings Redis and returns `503` when it is down.

## API

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
GET  /api/sessions/:sessionId/screens
GET  /api/sessions/:sessionId/screens/:screenId/state
GET  /api/health
```

- Validate names as non-empty strings with a maximum of 80 characters.
- Clamp lighting state through `@softcast/protocol` before storing it.
- Admin workspace responses use shared `SessionSummary`, `ScreenSummary`, and `AdminWorkspace` types.
- Public poll routes and health are `force-dynamic` so Next never caches them.

## Frontend Data Flow

The admin UI is a Redis-backed view, not the source of truth.

1. Clerk protects `/admin` and loads the authenticated user.
2. The page calls `GET /api/admin/sessions` same-origin (Clerk cookie).
3. Redis returns only sessions indexed to that user and still verifies each hash's `ownerId`.
4. Session and screen mutations return shared DTOs that update the local UI cache.
5. Screen state changes use authenticated `PUT` requests, coalesced so only one write is in flight at a time (the latest value always wins; the final value is sent on release). Never fire one request per pointer move.
6. The server stores the state and increments its revision.
7. Remote displays poll every 500ms via `useSoftcast`. The admin preview does not wait for those polls.

Important frontend rules:

- A page refresh or another signed-in device must reconstruct sessions and screens from Redis.
- Never persist the admin workspace only in React state or browser storage.
- Never authorize actions based on whether an item is present in the UI.
- Keep anonymous session/screen pages usable without Clerk.
- Distinguish API `401`/`403`/validation errors from backend connectivity errors.
- After the selected screen hydrates once, local optimistic state is the only source of truth for the lighting controls and the admin preview. Polls must not overwrite that state. Reset and re-hydrate only on screen switch. The admin preview is a local CSS fill, not the iframe renderer.

## Shared Protocol

`packages/protocol/src/index.ts` owns cross-package contracts:

- `LightingState`
- `SessionTarget`
- `ScreenSummary`
- `SessionSummary`
- `AdminWorkspace`
- `StoredLightingState`
- `clampLightingState` / `defaultLightingState`
- Mode-aware color conversion: `kelvinToCssColor` (cct), `hsvToRgb` / `hsvToCssColor` (color), and `lightingCssColor` which resolves the active color for the current mode
- Fullscreen renderer HTML (mode-aware: white at the Kelvin value in `cct`, the hue/saturation color in `color`, brightness as a dimmer in both)

Change the protocol package first when altering a cross-boundary shape, then update frontend consumers in the same change. Do not duplicate protocol interfaces locally.

## Environment and Clerk

- This project is linked to Clerk application `app_3FNlKv0uOdVJI7jDOPydle7VRA6`. It has **both** instances live:
  - **Development** (`ins_3FNlL1AiuSev7wQODfelj6TIaKa`): `pk_test`/`sk_test`, Frontend API on `…clerk.accounts.dev`. Used for local dev; keys live in `apps/web/.env.local`.
  - **Production** (`ins_3FV6awoYEmN19KOllclkst1owfW`): `pk_live`/`sk_live`, custom domain `softcast.studio`, Frontend API `clerk.softcast.studio`, account portal `accounts.softcast.studio`. This is what `softcast.studio` (Vercel) uses in production.
- Enabled sign-in methods: **Email** (built-in) and **Google**. Apple is disabled. Google in production uses a self-managed GCP OAuth client (consent screen "External"+published, scopes `openid`/`email`/`profile`, redirect `https://clerk.softcast.studio/v1/oauth_callback`).
- Next.js reads Clerk and Upstash values from `apps/web/.env.local` (dev).
- Production secrets live in the Vercel env store, never in git.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public. `CLERK_SECRET_KEY` is server-only and must never appear in client code or logs.
- Other expected variables are documented in `.env.example`: `PUBLIC_WEB_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- For Clerk CLI work, run `clerk doctor --json` first and prefer the repository's Clerk skill instructions. `clerk deploy` is interactive and must be run by the user in a real terminal; `clerk deploy status` and `clerk env pull --instance prod` are non-interactive and safe for an agent to run.

## Production

Production is live. See `deploy/DEPLOY.md`.

```
softcast.studio        → Vercel (UI + `/api/*` → Upstash Redis)
clerk.softcast.studio  → Clerk Frontend API (DNS-only CNAMEs)
```

- Vercel project `heydaytime/softcast`, auto-deploys on push to `main`; build config in `vercel.json`.
- Production env (in Vercel, never committed): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `PUBLIC_WEB_URL=https://softcast.studio`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- Setting Vercel env / deploying needs CLI auth: prefer `vercel login` (browser).

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

API smoke testing expects an already-running Next server owned by the user:

- Without `BACKEND_AUTH_TOKEN`, it verifies the unauthenticated guard.
- With `BACKEND_AUTH_TOKEN`, it exercises owner creation, hydration, state, public poll, code redemption, and deletion.
- With `BACKEND_OTHER_AUTH_TOKEN`, it also verifies cross-user mutation returns `403`.
- Do not start Next just to run this test. Ask the user to run the server if needed.

## Change Checklist

Before finishing a change, confirm:

- Admin writes require a verified Clerk user and exact Redis owner match.
- Anonymous clients can poll but cannot mutate.
- Session/screen metadata remains durable and reloadable.
- Redis keys remain under the `softcast:` prefix.
- Protocol and frontend agree on all DTOs.
- No secret was printed or moved into client code.
- No development server or user-owned process was started, stopped, or killed.
