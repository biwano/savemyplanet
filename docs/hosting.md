# Hosting (chosen)

Free tiers to develop and demo. They sleep, pause, or cap CPU. Store distribution, a funded service wallet, and production SLOs are the first things that outgrow this.

| Component | Host | Role |
| --- | --- | --- |
| API (`apps/backend`) | **Google Cloud Run** (`europe-west1` Belgium, or `europe-west9` Paris) | Hono Node container. Handles LLM calls, Stripe integration, and Klima x402 orchestration. |
| DB | **Neon** AWS `eu-central-1` (Frankfurt) | Serverless Postgres. Auto-suspends compute when idle; wakes on request. |
| Auth | **Clerk** | User management and auth. Polished Expo components. |
| Mobile (`apps/mobile`) | **Expo Go + EAS free** | Dev on Expo Go. EAS for internal builds. |
| Secrets / service wallet key | **Cloud Run secrets** | Secure storage for Klima keys, DB credentials, and Stripe keys. |

Hono on Cloud Run connects to Neon Postgres via the Drizzle driver. Keep the API and DB in **Europe** so that hop stays short. The phone talks only to Cloud Run; do not place Neon in the US to chase Klima/x402. Keep the API synchronous until timeouts force an async redesign. User management is handled by Clerk.

## Why not the usual free APIs

- **Supabase** — Excellent integrated platform, but the free tier pauses after 7 days of inactivity requiring a manual restore.
- **Vercel Hobby** — [Non-commercial only](https://vercel.com/docs/limits/fair-use-guidelines). Since this app takes a markup, it is commercial.

Optional later, not the API host: Cloudflare Pages for an Expo web preview; Cloudflare DNS if we have a domain (`*.run.app` works without it).

## Not free (plan for it)

- **Apple Developer** (~$99/year) and **Google Play** (~$25 once) to put the app on stores. Internal/dev builds via EAS do not need this.
- **USDC (or kVCM) on Base** in the backend service wallet. Hosting is free; retiring credits is not. Keep this balance off user devices.
- Production SLOs (no sleep, backups beyond Neon’s short restore window, a custom domain with SLA).

## CI (integration tests)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs `pnpm test` against a real Neon database. Configure a repository secret **`STAGING_DATABASE_URL`** (Neon connection string; host must contain `neon.tech`). Prefer a **staging branch** URL, not production.

Without this secret, GitHub injects an empty `DATABASE_URL` and tests would otherwise fall back to localhost — which cannot work with the Neon serverless WebSocket driver.

## Production DB migrations

After **CI succeeds** on a **push** to `main`, [`.github/workflows/migrate-production.yml`](../.github/workflows/migrate-production.yml) runs `pnpm db:migrate`.

Configure a GitHub Environment named **`production`** with secret **`PRODUCTION_DATABASE_URL`**. Prefer a **direct** (non-pooler) Neon connection string for drizzle-kit migrate.

## Production image build + Cloud Run deploy

Do **not** run `gcloud builds submit` by hand. After **migrate-production succeeds** (which itself runs only after CI on a **push** to `main`), [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml):

1. Builds `apps/backend/Dockerfile` on the runner (repo root context)
2. Pushes to Artifact Registry as `backend:<git-sha>` and `backend:latest`
3. Deploys that digest to Cloud Run (**image only** — keeps existing env, secrets, timeout, ingress)

Order is intentional: **CI → migrate → deploy**, so schema changes apply before the new revision serves traffic.

### One-time GCP setup

Coordinates are **hardcoded** in [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml) (`green-jet-454713-i7`, `europe-west1`, repo `savemyplanet`, service `savemyplanet-api`). No GitHub variables for those.

1. Enable APIs: `run`, `artifactregistry`, `iamcredentials`, `sts`.
2. Artifact Registry docker repo `savemyplanet` in `europe-west1` (already created).
3. Create deploy SA `github-deploy@green-jet-454713-i7.iam.gserviceaccount.com` with `roles/artifactregistry.writer`, `roles/run.admin`, and `roles/iam.serviceAccountUser` on the Cloud Run runtime SA.
4. Create [Workload Identity Federation](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account) so GitHub Actions can impersonate that SA:
   - Pool id: `github`
   - Provider id: `github-actions`
   - Attribute condition / principal set limited to this repo (and preferably the `production` environment)
   - Provider resource name must match the workflow: `projects/7566378171/locations/global/workloadIdentityPools/github/providers/github-actions`
5. GitHub Environment **`production`** still needs secret **`PRODUCTION_DATABASE_URL`** (migrate workflow only).
6. **Bootstrap** the Cloud Run service `savemyplanet-api` once (secrets, `--timeout=60`, `--allow-unauthenticated`, `CORS_ORIGINS`, etc.). After that, the Action only rolls the container image.
   - Production **must not** use `CORS_ORIGINS=*` — the process exits on boot (local-dev only). Use a comma-separated HTTPS/HTTP allowlist (e.g. Expo web / future marketing origin). Native Expo clients do not rely on CORS; the allowlist is for browser callers.
   - Example bootstrap (adjust origins as needed):

```bash
gcloud run deploy savemyplanet-api \
  --region=europe-west1 \
  --image=europe-west1-docker.pkg.dev/green-jet-454713-i7/savemyplanet/backend:latest \
  --platform=managed \
  --allow-unauthenticated \
  --timeout=60 \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,CLERK_PUBLISHABLE_KEY=CLERK_PUBLISHABLE_KEY:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,KLIMA_PAYER_PRIVATE_KEY=KLIMA_PAYER_PRIVATE_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,CLERK_WEBHOOK_SIGNING_SECRET=CLERK_WEBHOOK_SIGNING_SECRET:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,ADMIN_API_KEY=ADMIN_API_KEY:latest \
  --set-env-vars=NODE_ENV=production,CORS_ORIGINS=https://savemyplanet.ilponse.com
```

## Constraints

- The Expo app must use the Cloud Run HTTPS URL. No x402 from the client.
- Neon and Cloud Run stay in the same continent (Europe). If Cloud Run later moves to `us-central1` / `us-east1`, move Neon to `aws-us-east-1` or `aws-us-east-2`.
- Cloud Run must allow **outbound HTTPS** to `https://x402.klimalabs.com/`.
- Idle Neon + scale-to-zero Cloud Run means the first request after a pause can have a slight delay (~500ms for Neon, ~2-5s for Cloud Run). The mobile app should show a loading state.
