# Deploy to your own Cloudflare account

This project is configured to deploy as a **new app**, not as the older `djkwinten-app` deployment.

## New Worker names

- Backend/API Worker: `djkwinten-bookingmanager-api`
- Frontend Worker: `djkwinten-bookingmanager`

## Important

Do not store Cloudflare tokens, GitHub tokens, or Brevo/API keys in repository files.
Use Cloudflare/Nxcode secret management for secrets.

## Required Cloudflare resources

For full production functionality, create these resources in your own Cloudflare account:

1. D1 database, for bookings and app data
2. R2 bucket, for uploads/files
3. Secret for the Brevo/API mail key (`BREVO_API_KEY`)

Suggested names:

```text
D1 database: dj-booking-db
R2 bucket:   dj-booking-fotos
```

After creating D1 and R2, add their bindings to `backend/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "dj-booking-db"
database_id = "YOUR_D1_DATABASE_ID"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "dj-booking-fotos"
```

Then run the database schema:

```bash
nxcode d1 execute YOUR_D1_DATABASE_ID --file backend/schema.sql
```

## GitHub → Cloudflare fix for white screen

If Cloudflare shows a white screen and the HTML contains:

```html
<script type="module" src="/src/main.tsx"></script>
```

then Cloudflare is serving the Vite source files instead of the production build. Fix the Cloudflare project settings like this.

### Option A: Cloudflare project root is repository root

Use these settings:

```text
Root directory:       /
Build command:        npm run build
Build output/assets:  dist
```

The repository root contains `package.json` and `wrangler.toml` for this setup. The root build script builds `frontend/` and copies `frontend/dist` to root `dist/`.

### Option B: Cloudflare project root is `frontend`

Use these settings:

```text
Root directory:       frontend
Build command:        npm install && npm run build
Build output/assets:  dist
```

The `frontend/wrangler.toml` file is configured to serve `dist/` with SPA fallback.

### Required frontend environment variable

Set this in Cloudflare before building if you want the deployed frontend to call the deployed backend:

```text
VITE_API_URL=https://YOUR-BACKEND-WORKER.workers.dev
```

For the Nxcode deployment made during development, that backend was:

```text
VITE_API_URL=https://thr-849231d5-djkwinten-bookingmanager-api.nxcode-io.workers.dev
```

After redeploying, the live HTML must reference `/assets/index-....js`, not `/src/main.tsx`.

## Deployment order

Deploy backend first, because the frontend needs the backend URL at build time.

From `/workspace`:

```bash
nxcode deploy --type hono --dir dj-booking-app/backend
```

Copy the returned backend URL, for example:

```text
https://djkwinten-bookingmanager-api.YOUR_WORKERS_SUBDOMAIN.workers.dev
```

Then build the frontend with that API URL:

```bash
cd /workspace/dj-booking-app/frontend
VITE_API_URL="https://djkwinten-bookingmanager-api.YOUR_WORKERS_SUBDOMAIN.workers.dev" npm run build
```

Deploy the frontend:

```bash
cd /workspace
nxcode deploy --type static --dir dj-booking-app/frontend/dist
```

After the frontend URL is known, update `APP_URL` in `backend/wrangler.toml` and redeploy the backend so emails contain the correct app link.

## One-command helper

`deploy.sh` deploys backend first, parses the backend URL, builds the frontend with that URL, and deploys the frontend:

```bash
cd /workspace/dj-booking-app
./deploy.sh
```

If you already know the backend URL:

```bash
cd /workspace/dj-booking-app
VITE_API_URL="https://your-backend-url" ./deploy.sh
```

## Current local preview

For local development, the frontend uses relative `/api` requests and the Vite proxy sends them to the backend dev server on port `3001`.

## Brevo e-mail secret

The backend uses the Brevo HTTP API for e-mail. Set the API key as a Worker secret; do **not** commit it to `wrangler.toml`.

Preferred secret name:

```bash
nxcode secret set djkwinten-bookingmanager-api BREVO_API_KEY 'xkeysib-...'
```

The old name `SMTP_PASS` is still supported for compatibility:

```bash
nxcode secret set djkwinten-bookingmanager-api SMTP_PASS 'xkeysib-...'
```

For local development, create `backend/.env` from `backend/.env.example` and fill in `BREVO_API_KEY`.
Restart the backend dev server after changing `.env`.
