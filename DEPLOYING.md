# Deploying & sharing this app

This app manages **collection conditions sources** (create / list / rename / delete) for
the shop, seeding each source with the first few products as manual inclusion selections.

Running `shopify app dev` only works on your machine because the Shopify CLI tunnels
`localhost`. To let **other people install and use it**, you need two independent things:

1. **A persistent host** for the React Router server (Shopify renders it in an iframe, so it
   needs a stable public URL).
2. **A distribution method** chosen in the Dev/Partner Dashboard so others can install it.

---

## ⚠️ Before you start: two caveats specific to this app

- **API version is `Unstable`.** The collection conditions source APIs aren't in a stable
  version yet, so `app/shopify.server.js` and `.graphqlrc.js` pin `ApiVersion.Unstable`.
  Unstable can change or break without notice — fine for a demo, **not** something to rely on
  long-term. Re-pin to a stable version (e.g. `2026-07`) once these APIs ship there.
- **Database is now Postgres, not SQLite.** The template shipped with file-based SQLite, which
  gets wiped on most container restarts and can't be shared across instances. Session tokens
  (i.e. who has the app installed) live in this DB, so it **must** be persistent. The schema now
  uses `DATABASE_URL` (see `prisma/schema.prisma`).

---

## 🚀 Quick path: deploy to Render (free)

This repo includes a **`render.yaml` blueprint** that provisions the Docker web service **and**
a free Postgres database, wiring `DATABASE_URL` between them automatically. It's the cheapest
way to get a public URL for this sample app.

> Render's **free** web service cold-starts (~1 min) after inactivity, and its **free** Postgres
> is deleted after ~30 days. Both are fine for a throwaway demo; bump to paid plans (or swap in a
> Neon free DB) for anything you want to keep.

1. **Push this repo to GitHub/GitLab** (Render deploys from a Git remote).
2. In Render: **New → Blueprint**, connect the repo. Render reads `render.yaml` and creates the
   web service + Postgres.
3. Your service URL is predictable from the service name:
   **`https://sample-collection-sources.onrender.com`**. In the Render dashboard, set the three
   `sync: false` env vars on the web service:
   - `SHOPIFY_APP_URL` → that onrender.com URL
   - `SHOPIFY_API_KEY` → prod app client ID (`shopify app env show`)
   - `SHOPIFY_API_SECRET` → prod app client secret
   `DATABASE_URL` is already filled in from the database; the container runs `prisma migrate
   deploy` on boot, so the schema is created automatically.
4. Put that same URL into your prod `.toml` (`application_url` + `[auth] redirect_urls`), then
   `shopify app deploy` (see steps 1, 5, 6 below) and choose **Custom distribution**.

The rest of this doc is the host-agnostic version of the same steps, plus distribution details.

---

## 1. Create a separate production app

Keep dev and prod apps separate so deploying prod never disturbs `shopify app dev`.

1. In the Dev Dashboard, create a **new app** for production (or reuse one dedicated to it).
2. Link a prod config locally — this generates `shopify.app.<name>.toml` with the real `client_id`:

   ```bash
   shopify app config link
   ```

   (`shopify.app.production.toml.example` in this repo shows what the result should look like.)
3. In that prod `.toml`, set:
   - `application_url = "https://<your-host>"`
   - `[auth] redirect_urls = [ "https://<your-host>/auth/callback" ]`
   - `automatically_update_urls_on_dev = false` (so local dev can't overwrite prod URLs)

## 2. Provision a Postgres database

Any managed Postgres works (Cloud SQL, Neon, Render, Fly Postgres, etc.). Grab its
connection string for `DATABASE_URL`. (On Render via `render.yaml`, this is created and wired
for you — skip this step.)

## 3. Set environment variables on your host

See `.env.example` for the full list. Read the Shopify values from the **prod** app:

```bash
shopify app env show
```

Required on the host:

| Variable | Notes |
|----------|-------|
| `SHOPIFY_APP_URL` | Deployed origin, incl. protocol. Must match `application_url`. |
| `SHOPIFY_API_KEY` | App client ID. |
| `SHOPIFY_API_SECRET` | App client secret — store as a secret, never commit. |
| `DATABASE_URL` | Persistent Postgres connection string. |
| `SCOPES` | Optional with Shopify-managed install. |
| `PORT` | Optional; defaults to `3000`, must match the Dockerfile `EXPOSE`. |

## 4. Deploy the server

The repo has a **pnpm-based `Dockerfile`** ready to go. Pick a host — Shopify documents
[Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service),
[Fly.io](https://shopify.dev/docs/apps/launch/deployment), and
[Render](https://shopify.dev/docs/apps/launch/deployment) as common options.

The container entrypoint runs `npm run setup` (which does `prisma generate && prisma migrate
deploy`) and then starts the server, so the DB schema is created/updated on boot.

If you deploy without Docker:

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run setup    # prisma generate + migrate deploy against DATABASE_URL
pnpm run start
```

## 5. Push the app config to Shopify

```bash
shopify app deploy
```

This releases a new app version with your prod `application_url`, redirect URLs, scopes, and
webhook subscriptions.

## 6. Choose a distribution method

In the Dev/Partner Dashboard → **App distribution**. You **cannot change this later**, so choose
deliberately:

- **Custom distribution** ✅ — gives you an **install link**. Installs on a single store, on
  stores in the same Plus organization, or on **transfer-disabled development stores**. No app
  review. **This is the right choice for a demo others install on their own dev stores.**
- **Public distribution** — App Store listing + Shopify review. Overkill for a demo.

Then share the generated install link. Recipients open it, pick their store, install, and the
app's Home page is the collection-sources manager.

---

## Redeploying later

```bash
shopify app config use <prod-config>   # make sure you're on the prod config
shopify app deploy                     # push config changes
# redeploy the container (host-specific) to ship code changes
```

## References

- [Render Blueprint spec](https://render.com/docs/blueprint-spec) — what `render.yaml` is using
- [About deployment](https://shopify.dev/docs/apps/launch/deployment)
- [Deploy to a hosting service](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service)
- [About app distribution](https://shopify.dev/docs/apps/launch/distribution)
- [Select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method)
