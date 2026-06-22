# Deploy Softcast

The public product at [softcast.studio](https://softcast.studio) is a Next.js app on Vercel. Redis is Upstash. Sign-in is Clerk. DNS for Clerk's frontend API and account portal is separate from the Vercel app.

Git pushes do not have to deploy this project. Publish a production build from a machine that is logged into Vercel:

```bash
vercel deploy --prod
```

## Environment

Set these on the host (Vercel env, or your own process environment):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
PUBLIC_WEB_URL
KV_REST_API_URL
KV_REST_API_TOKEN
```

`PUBLIC_WEB_URL` is the public origin used when the API writes session and screen links, for example `https://softcast.studio`. Redis also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` instead of the `KV_*` pair.

`NEXT_PUBLIC_*` values are inlined at build time. After changing them, publish a new deployment.

The browser calls same-origin `/api/*`. You do not need a separate API host.

## Clerk

Create a Clerk application and point its frontend API at your domain if you want custom account URLs. Add your site origin to Clerk's allowed origins. Email and Google sign-in are enough for the console; displays never sign in.

## Upstash

Create a Redis database and paste the REST URL and token into the env vars above. Local development can use the same database or a separate one.

## Verify

```bash
curl -fsS https://your-origin.example/api/health
```

Then open `/admin`, sign in, create a session and a screen, generate a code, and confirm a display picks up lighting changes within about a second.

Build config is in the repo-root `vercel.json`: `bun install`, then `bun run --filter @softcast/web build`.
