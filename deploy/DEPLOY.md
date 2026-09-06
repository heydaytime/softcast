# Softcast deployment

```
softcast.studio        → Vercel (Next.js UI + Route Handlers)
clerk.softcast.studio  → Clerk Frontend API (DNS-only CNAMEs)
Redis                  → Upstash (Vercel Marketplace)
```

Git pushes do not deploy. Publish with `vercel deploy --prod` from this repo.

## Vercel env

Project `heydaytime/softcast`. Required production variables:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
CLERK_SECRET_KEY=sk_live_…
PUBLIC_WEB_URL=https://softcast.studio
KV_REST_API_URL=…
KV_REST_API_TOKEN=…
```

`NEXT_PUBLIC_*` values are inlined at build time. After changing them, publish a new deployment with `vercel deploy --prod`.

The browser calls same-origin `/api/*`.

## Upstash

The production Redis database is the Upstash resource connected to this Vercel project. Local development uses the same REST credentials in `apps/web/.env.local`.

## Clerk

Production instance on custom domain `softcast.studio`. Frontend API `clerk.softcast.studio`, account portal `accounts.softcast.studio`. Cloudflare records `clerk`, `accounts`, `clkmail`, `clk._domainkey`, and `clk2._domainkey` stay DNS only.

## Verify

```bash
curl -fsS https://softcast.studio/api/health
```

Then open `https://softcast.studio/admin`, sign in, create a session + screen, generate a code, and confirm a screen page picks up lighting changes within about a second.
