# Hosting (chosen)

Free tiers to develop and demo. They sleep, pause, or cap CPU. Store distribution, a funded service wallet, and production SLOs are the first things that outgrow this.

| Component | Host | Role |
| --- | --- | --- |
| API (`apps/backend`) | **Google Cloud Run** (`europe-west1` Belgium, or `europe-west9` Paris) | Hono Node container. Handles LLM calls, Stripe integration, and Klima x402 orchestration. |
| DB | **Neon** AWS `eu-central-1` (Frankfurt) | Serverless Postgres. Auto-suspends compute when idle; wakes on request. |
| Auth | **Clerk** | User management and auth. Polished Expo components. |
| Mobile (`apps/mobile`) | **Expo Go + EAS free** (+ **Expo web** for staging) | Dev on Expo Go. EAS for internal builds. Staging demo via Expo web → staging API. |
| Secrets / service wallet key | **Cloud Run secrets** | Secure storage for Klima keys, DB credentials, and Stripe keys. |

Hono on Cloud Run connects to Neon Postgres via the Drizzle driver. Keep the API and DB in **Europe** so that hop stays short. The phone talks only to Cloud Run; do not place Neon in the US to chase Klima/x402. Keep the API synchronous until timeouts force an async redesign. User management is handled by Clerk.

## Staging vs production

| | Staging | Production |
| --- | --- | --- |
| Cloud Run | Separate service (e.g. `savemyplanet-api-staging`); **deploy on push to `staging`** | `savemyplanet-api`; deploy on push to `main` |
| Runtime SA | `savemyplanet-api-staging@…` (only `STAGING_*` + shared OpenRouter) | Dedicated prod SA preferred; today still default Compute Engine SA |
| Neon | Development DB / branch (`STAGING_DATABASE_URL`) | `PRODUCTION_DATABASE_URL` |
| Clerk | Development instance keys + webhooks → staging URL (`STAGING_CLERK_*` secrets) | Production keys + webhooks → prod URL (`CLERK_*`) |
| Stripe | **Test** mode keys + test webhook (`STAGING_STRIPE_*`) | **Live** keys + live webhook (`STRIPE_*`) |
| Admin | Separate key (`STAGING_ADMIN_API_KEY`) | `ADMIN_API_KEY` |
| Klima retire | **Fake** (env-gated stub; no USDC spend). Discover/quote still hit live Klima reads. | Real x402 from service wallet; **boot fails** if fake mode is set |
| Client | Expo web + Expo Go / EAS preview → staging `EXPO_PUBLIC_API_URL` | Native (later) → prod URL |

Staging is the default integration target for mobile until an explicit production cutover. Fake retire must never be enabled on the production service. Details and checkboxes: [plan.md Phase S](plan.md#phase-s--staging).

**Git branches:** push to **`staging`** → migrate + deploy **staging** API; push to **`main`** → migrate + deploy **production** API. Do not cross-wire those triggers.

Expo web hosting (EAS Hosting or Cloudflare Pages) is in scope for **staging** demos; allow that HTTPS origin on staging `CORS_ORIGINS`.

## Why not the usual free APIs

- **Supabase** — Excellent integrated platform, but the free tier pauses after 7 days of inactivity requiring a manual restore.
- **Vercel Hobby** — [Non-commercial only](https://vercel.com/docs/limits/fair-use-guidelines). Since this app takes a markup, it is commercial.

Optional for Expo web staging (not the API host): **EAS Hosting** or Cloudflare Pages. Cloudflare DNS if we have a domain (`*.run.app` works without it).

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

## Staging migrate + Cloud Run deploy

Mirror production, but trigger on **push to `staging`** (not `main`):

1. CI on the `staging` branch ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml) listens to `main` and `staging`)
2. Migrate staging Neon ([`.github/workflows/migrate-staging.yml`](../.github/workflows/migrate-staging.yml)) using GitHub Environment **`staging`** secret **`STAGING_DATABASE_URL`** (same Neon development DB / branch as CI; can also be a repo secret)
3. Build/push image tags `backend:staging-<sha>` / `backend:staging-latest` and deploy **`savemyplanet-api-staging`** ([`.github/workflows/deploy-backend-staging.yml`](../.github/workflows/deploy-backend-staging.yml); image only; staging secrets/env stay on that service)

Order is the same as production: **CI → migrate → deploy**. Pushes to `main` must not update staging; pushes to `staging` must not update production. Image tags are prefixed (`staging-…`) so they never overwrite production `backend:latest`.

### Staging URLs (record for Expo)

| | URL |
| --- | --- |
| Staging API | `https://savemyplanet-api-staging-7566378171.europe-west1.run.app` |
| Expo `EXPO_PUBLIC_API_URL` | same as staging API |
| Expo web origin (`CORS_ORIGINS`) | `https://staging.app.clearmycarbon.com` |
| Production API | `https://savemyplanet-api-7566378171.europe-west1.run.app` |

### Staging bootstrap (one-time)

Staging uses **Clerk development** keys, **Stripe test** keys, Neon **development** (`STAGING_DATABASE_URL`), and **`KLIMA_RETIRE_MODE=fake`** (no USDC spend; discover/quote still hit live Klima). Production **must not** set fake mode — the process exits on boot when `K_SERVICE=savemyplanet-api` and `KLIMA_RETIRE_MODE=fake`.

Do **not** mount production Secret Manager secrets on staging. Env var names stay the same (`CLERK_SECRET_KEY`, …); Secret Manager **ids** are prefixed `STAGING_*` so Clerk/Stripe/admin never share prod values. `OPENROUTER_API_KEY` may be shared (no test/live split).

Use a **dedicated Cloud Run runtime SA** for staging (`savemyplanet-api-staging@…`). Do not run staging as the default Compute Engine SA (or the production runtime SA) — staging must only be able to read `STAGING_*` secrets (plus shared `OPENROUTER_API_KEY`). That way a mistaken `--set-secrets` mount of a prod secret id fails closed.

1. Create GitHub Environment **`staging`** with secret **`STAGING_DATABASE_URL`** (or rely on the existing repo secret of the same name).
2. Create the staging runtime SA, secrets, and IAM:

```bash
PROJECT_ID=green-jet-454713-i7
STAGING_RUNTIME_SA=savemyplanet-api-staging@${PROJECT_ID}.iam.gserviceaccount.com
DEPLOY_SA=github-deploy@${PROJECT_ID}.iam.gserviceaccount.com

gcloud iam service-accounts create savemyplanet-api-staging \
  --display-name='ClearMyCarbon Cloud Run staging'

# Deploy SA must be allowed to attach this identity when creating/updating the service.
gcloud iam service-accounts add-iam-policy-binding "$STAGING_RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser"

create_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${STAGING_RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
}

# Clerk development / Stripe test / Neon development (prefer pooled for Cloud Run).
create_secret STAGING_DATABASE_URL 'postgresql://user:pass@….neon.tech/db?sslmode=require'
create_secret STAGING_CLERK_PUBLISHABLE_KEY 'pk_test_…'
create_secret STAGING_CLERK_SECRET_KEY 'sk_test_…'
create_secret STAGING_CLERK_WEBHOOK_SIGNING_SECRET 'whsec_…'   # after step 3, if needed
create_secret STAGING_STRIPE_SECRET_KEY 'sk_test_…'
create_secret STAGING_STRIPE_WEBHOOK_SECRET 'whsec_…'          # after step 3, if needed
create_secret STAGING_ADMIN_API_KEY "$(openssl rand -hex 32)"

# Shared LLM key: grant staging accessor (prod runtime SA should already have it).
gcloud secrets add-iam-policy-binding OPENROUTER_API_KEY \
  --member="serviceAccount:${STAGING_RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Do **not** grant `STAGING_RUNTIME_SA` access to production secrets (`DATABASE_URL`, `CLERK_*`, `STRIPE_*`, `ADMIN_API_KEY`, `KLIMA_PAYER_PRIVATE_KEY`, …).

3. Point **Clerk development** webhook(s) at `https://<staging-run-url>/webhooks/clerk` and **Stripe test** webhook(s) at `https://<staging-run-url>/webhooks/stripe`. Then set / refresh `STAGING_CLERK_WEBHOOK_SIGNING_SECRET` and `STAGING_STRIPE_WEBHOOK_SECRET` with the endpoint signing secrets (not the production `CLERK_WEBHOOK_*` / `STRIPE_WEBHOOK_*` secrets).
4. Bootstrap the service once (then Actions only roll the image):

```bash
gcloud run deploy savemyplanet-api-staging \
  --region=europe-west1 \
  --image=europe-west1-docker.pkg.dev/green-jet-454713-i7/savemyplanet/backend:staging-latest \
  --platform=managed \
  --allow-unauthenticated \
  --timeout=60 \
  --service-account=savemyplanet-api-staging@green-jet-454713-i7.iam.gserviceaccount.com \
  --set-secrets=DATABASE_URL=STAGING_DATABASE_URL:latest,CLERK_PUBLISHABLE_KEY=STAGING_CLERK_PUBLISHABLE_KEY:latest,CLERK_SECRET_KEY=STAGING_CLERK_SECRET_KEY:latest,STRIPE_SECRET_KEY=STAGING_STRIPE_SECRET_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,CLERK_WEBHOOK_SIGNING_SECRET=STAGING_CLERK_WEBHOOK_SIGNING_SECRET:latest,STRIPE_WEBHOOK_SECRET=STAGING_STRIPE_WEBHOOK_SECRET:latest,ADMIN_API_KEY=STAGING_ADMIN_API_KEY:latest \
  --set-env-vars=NODE_ENV=production,KLIMA_RETIRE_MODE=fake,CORS_ORIGINS=https://staging.app.clearmycarbon.com
```

Notes:

- Omit `KLIMA_PAYER_PRIVATE_KEY` on staging while fake retire is on (real x402 is not used).
- `CORS_ORIGINS` is an allowlist (no `*`). Staging Expo web: `https://staging.app.clearmycarbon.com`.
- First bootstrap may use `backend:latest` if `staging-latest` does not exist yet; subsequent pushes to `staging` publish `staging-*` tags.
- If staging was already bootstrapped with shared Clerk/Stripe/admin secrets or the default Compute SA, re-run the deploy above after creating the `STAGING_*` secrets and staging runtime SA.

### One-time GCP setup

Coordinates are **hardcoded** in [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml) (`green-jet-454713-i7`, `europe-west1`, repo `savemyplanet`, service `savemyplanet-api`). No GitHub variables for those.

1. Enable APIs: `run`, `artifactregistry`, `iamcredentials`, `sts`.
2. Artifact Registry docker repo `savemyplanet` in `europe-west1` (already created).
3. Create deploy SA `github-deploy@green-jet-454713-i7.iam.gserviceaccount.com` with `roles/artifactregistry.writer`, `roles/run.admin`, and `roles/iam.serviceAccountUser` on each Cloud Run runtime SA (staging `savemyplanet-api-staging@…`, and production’s runtime SA).
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
