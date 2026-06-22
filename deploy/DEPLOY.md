# Softcast deployment

Production topology:

```
softcast.studio        -> frontend (Vercel, auto-deploys on push to main)
api.softcast.studio    -> Cloudflare (orange-cloud, Full -> origin over HTTPS)
                          -> hdtrs   (GCP edge, WireGuard client, Caddy :443, public 34.29.172.203)
                            -> [WireGuard] -> Pi 192.168.100.150
                                              -> Caddy :80 -> Bun backend 127.0.0.1:4000 -> Redis
clerk.softcast.studio  -> Clerk Frontend API (production instance only; DNS-only, later)
```

Cloudflare terminates public TLS for `api.softcast.studio` and connects to the
origin `hdtrs` (a GCP box that also fronts `api.blendr.live` / `ai.heydaytime.net`).
`hdtrs` Caddy auto-provisions a Let's Encrypt cert for `api.softcast.studio` and
reverse-proxies over WireGuard to the Pi's Caddy, which fronts the Bun backend.
The Pi runs Redis (AOF) and a systemd unit that auto-starts the backend on boot.
Backend code deploys are manual (rsync over ssh) — no CI/CD for the backend.

### hdtrs edge (one-time)

`hdtrs` already runs Caddy (`/etc/caddy/Caddyfile`) for other sites. Append the
softcast block (see `deploy/hdtrs-softcast.caddy`) — do NOT replace the file:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s)
# append the api.softcast.studio { reverse_proxy 192.168.100.150:80 } block
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

The Pi must already be serving on `:80` (its own Caddy) and reachable from `hdtrs`
over WireGuard at `192.168.100.150`.

## Clerk (development instance, for now)

We ship on the Clerk **development** instance first so the whole chain can be
tested. It has a dev banner and a ~100-user cap, but no code changes are needed
to upgrade later. Keys used (both `pk_test_…` / `sk_test_…`):

- Frontend (Vercel): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Backend (Pi):      `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

In the Clerk dashboard (dev instance), add `https://softcast.studio` to the
allowed origins / paths so dev tokens are accepted from the live frontend.

### Upgrading to a production Clerk instance later

1. Create a Production instance in the Clerk dashboard.
2. Add the DNS records Clerk gives you (CNAMEs: `clerk`, `accounts`, `clkmail`,
   a DKIM record …) under `softcast.studio` in Cloudflare. DNS-only, no hosting.
3. Swap the Vercel + Pi env vars to the `pk_live_…` / `sk_live_…` keys.
4. Redeploy frontend (push) and `sudo systemctl restart softcast-backend`.

## Frontend (Vercel)

Project already exists and auto-deploys from `main`. Required production env vars:

```
NEXT_PUBLIC_BACKEND_URL=https://api.softcast.studio
NEXT_PUBLIC_WS_URL=wss://api.softcast.studio/ws
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…
```

Set via `vercel env add <NAME> production` (after `vercel login` + `vercel link`)
or in the dashboard, then trigger a deploy (push to `main`). Build config lives in
`vercel.json` (`bun install` + `bun run --filter @softcast/web build`).

## Backend (Raspberry Pi) — one-time setup

Host: Ubuntu 25.10 arm64, ssh alias `pi`, user `heyday`, app dir `/home/heyday/softcast`.

1. Install runtime + services:

   ```bash
   curl -fsSL https://bun.sh/install | bash          # bun -> ~/.bun/bin/bun
   sudo apt-get update
   sudo apt-get install -y redis-server caddy rsync
   ```

2. Redis with persistence (Softcast's only durable store):

   ```bash
   sudo cp /home/heyday/softcast/deploy/redis.conf /etc/redis/redis.conf
   sudo systemctl enable --now redis-server
   ```

3. Backend env (secrets — never in git):

   ```bash
   sudo mkdir -p /etc/softcast
   sudo install -m 600 /dev/null /etc/softcast/backend.env
   sudo editor /etc/softcast/backend.env      # fill from deploy/backend.env.example
   ```

4. systemd service:

   ```bash
   sudo cp /home/heyday/softcast/deploy/softcast-backend.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now softcast-backend
   ```

5. Caddy reverse proxy:

   ```bash
   sudo cp /home/heyday/softcast/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   sudo systemctl reload caddy
   ```

## Backend deploys (ongoing)

From your laptop, after committing/pushing code:

```bash
./deploy/deploy-to-pi.sh
```

This rsyncs the repo (excluding `apps/`, `node_modules`, build cruft, and any
`.env*`), runs `bun install`, restarts the service, and health-checks
`http://127.0.0.1:4000/health` on the Pi.

## Verify

```bash
# On the Pi
systemctl status softcast-backend redis-server caddy
curl -fsS http://127.0.0.1:4000/health        # {"ok":true}
curl -fsS -H 'Host: api.softcast.studio' http://127.0.0.1/health

# Public (through Cloudflare)
curl -fsS https://api.softcast.studio/health
```

Then open `https://softcast.studio/admin`, sign in (Clerk dev), create a session
+ screen, generate a code, and confirm a screen page receives live updates over
`wss://api.softcast.studio/ws`.
