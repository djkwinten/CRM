# Production deployment and rollback

## Canonical production identity

This repository has one deployable application:

- Worker: `crm`
- Public app: `https://crm.dentandtkwinten.workers.dev`
- D1 database: `dj-booking-db`
- D1 database ID: `25eee93e-26c4-4789-8cbc-3fd5f3a8c93d`
- R2 bucket: `dj-booking-fotos`

The React application, API, scheduled jobs, D1 binding, and R2 binding are all defined by the root `wrangler.toml`. Browser API calls are same-origin (`/api/...`), so there is no frontend API URL setting and no separate frontend/backend release order.

Do not create a replacement D1 database or R2 bucket during a normal release. Keeping the existing resource IDs is what preserves bookings, questionnaire answers, contracts, meetings, files, templates, reminders, Gmail intake state, and internal tasks.

## Secrets

Credentials are not stored in the repository or in Worker variables. The supported runtime secrets are:

- `BREVO_API_KEY` (or the legacy `SMTP_PASS` name)
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Inspect the currently provisioned secret names before release:

```bash
nxcode secret list crm
```

If a required secret is absent, provision it with the platform's secure secret flow. Never put a credential in `.env.example`, `wrangler.toml`, source code, a URL, a commit, or deployment output.

## Pre-release checks and recovery point

From the repository root:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm run check
npm test
npm run build
```

Create a data recovery point before applying schema or code changes:

```bash
curl --fail --silent --show-error \
  https://crm.dentandtkwinten.workers.dev/api/export/bookings.json \
  --output "crm-backup-$(date +%Y%m%d-%H%M%S).json"
```

Keep that file outside the repository. It contains customer data and must not be committed.

Record the current release commit as the code rollback point:

```bash
git rev-parse HEAD
```

## Additive schema migration

Do not use `backend/schema.sql` by itself as a migration for an existing database: SQLite's `CREATE TABLE IF NOT EXISTS` does not add columns to an existing table.

The prepared idempotent runner and exact old-to-new plan are documented in `CONSOLIDATION.md`. The runner checks `PRAGMA table_info` before every `ALTER TABLE`, creates only missing tables, and contains no destructive statements. It is deliberately not connected to the Worker or deployment script yet, so production cannot be migrated until an explicit execution path is reviewed and approved.

For a completely empty database, `backend/schema.sql` remains the canonical clean-install schema. For the existing production database, first secure a complete D1/R2 recovery point and then use the approved migration runner; never create a replacement database for a normal release.

## Deploy

The helper runs checks, builds the frontend, and deploys the root Worker through Nxcode:

```bash
./deploy.sh
```

Do not run a separate static deployment and do not use Wrangler directly.

## Post-release acceptance

Verify the public shell, API, and a real production data read:

```bash
curl --fail --silent --show-error https://crm.dentandtkwinten.workers.dev/ >/dev/null
curl --fail --silent --show-error https://crm.dentandtkwinten.workers.dev/health
curl --fail --silent --show-error https://crm.dentandtkwinten.workers.dev/api/bookings >/dev/null
```

Then check in the browser that the dashboard loads, one existing booking opens, its questionnaire/contract state is intact, and a customer portal link opens. Sending mail and Gmail intake remain unverified unless their live provider credentials are present and a production-like probe succeeds.

## Rollback

### Code/configuration rollback

1. Check out the recorded pre-release commit.
2. Run the checks and build.
3. Redeploy the same root Worker with `./deploy.sh`.
4. Keep the same D1 and R2 bindings; changing resource IDs during rollback would hide production data.

### Data rollback

The schema migration is additive, so a code rollback normally does not require deleting tables or columns. If production data itself was changed incorrectly, use the pre-release JSON backup and the app's import endpoint only after reviewing the affected records; do not drop or recreate the D1 database. R2 files are not embedded in the JSON export, so preserve the existing bucket and restore individual objects only from an independently retained R2 copy when necessary.

## Retiring old deployments

The old split API Worker or dead aliases may be removed only after the canonical URL passes all acceptance checks and current secrets are confirmed on `crm`. Deleting old Workers does not migrate data; verify that none of them owns a unique D1/R2 binding before removal.
