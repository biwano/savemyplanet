# Google Cloud Run & CI — how production ships

Human walkthrough of how the ClearMyCarbon API gets onto Cloud Run, and how GitHub Actions, Neon, and GCP talk to each other. Short “chosen hosts” table: [`docs/hosting.md`](../hosting.md). Workflow source of truth:

| Workflow | File |
| --- | --- |
| Tests | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (`main` + `staging`) |
| Production DB migrate | [`.github/workflows/migrate-production.yml`](../../.github/workflows/migrate-production.yml) |
| Production build + Cloud Run deploy | [`.github/workflows/deploy-backend.yml`](../../.github/workflows/deploy-backend.yml) |
| Staging DB migrate | [`.github/workflows/migrate-staging.yml`](../../.github/workflows/migrate-staging.yml) |
| Staging build + Cloud Run deploy | [`.github/workflows/deploy-backend-staging.yml`](../../.github/workflows/deploy-backend-staging.yml) |

---

## Mental model: three layers + everything else

Think of production as three GCP layers, plus dependents that are **not** on GCP:

```
  Identity   GitHub Actions → Workload Identity → github-deploy SA
  Artifacts  Docker images in Artifact Registry
  Runtime    Cloud Run service (stable config; CI only swaps the image)

  Outside    Neon, Clerk, Stripe, OpenRouter, Klima — reachable over HTTPS,
             secret-mounted into Cloud Run (or used only by CI for migrate/tests)
```

The phone (Expo) talks **only** to the Cloud Run HTTPS URL. It never talks to Klima x402 or Neon directly. The backend retires credits and holds the markup; that is why Klima stays server-side.

---

## The cast

| Actor | What it is | What it is allowed to do |
| --- | --- | --- |
| **CI workflow** | GitHub Actions job on push/PR | Run `pnpm test` against Neon **staging**. No GCP. No production DB. |
| **Migrate workflow** | GitHub Actions job after green push-CI | Apply Drizzle migrations to Neon **production**. No Docker, no Cloud Run. |
| **Deploy workflow** | GitHub Actions job after green migrate | Build image → push to Artifact Registry → roll Cloud Run image. |
| **GitHub OIDC token** | Short-lived JWT minted for a job (`id-token: write`) | Prove “I am this repo / this environment / this workflow run.” |
| **WIF pool + provider** | GCP trust config for GitHub’s OIDC issuer | Accept that JWT (if attribute conditions match) and mint a federated Google identity. |
| **`github-deploy@…` SA** | Deploy service account | Push images, deploy Cloud Run, impersonate the **runtime** SA as needed. Not project owner. |
| **Cloud Run runtime SA** | Identity the **running container** uses | Reach Secret Manager, call outbound HTTPS, etc. Separate from the deploy SA. |
| **Artifact Registry** | Docker repo `savemyplanet` | Store `backend:<sha>`, `backend:latest`, and `backend:buildcache`. |
| **Cloud Run service** | `savemyplanet-api` | Serve the API. Config (env, secrets, timeout, ingress) is sticky; deploy only changes the image. |
| **Neon staging / production** | Two Postgres URLs | Staging for tests; production for migrate + the live service. |

Hardcoded coordinates live in `deploy-backend.yml` (not GitHub Variables). Rename project/region/service → edit that env block.

| Setting | Value |
| --- | --- |
| GCP project id | `green-jet-454713-i7` |
| GCP project number | `7566378171` |
| Region | `europe-west1` |
| Artifact Registry repo | `savemyplanet` |
| Image | `europe-west1-docker.pkg.dev/green-jet-454713-i7/savemyplanet/backend` |
| Cloud Run service | `savemyplanet-api` |
| Deploy SA | `github-deploy@green-jet-454713-i7.iam.gserviceaccount.com` |
| WIF provider | `projects/7566378171/locations/global/workloadIdentityPools/github/providers/github-actions` |

---

## The shipping handshake (one push to `main`)

```
  push to main (or PR — PR stops after CI)
      │
      ▼
   [ CI ]
      │  “do the tests pass against staging Neon?”
      │
      │  only if: success AND event was push (not a PR)
      ▼
   [ Migrate production ]
      │  “is production schema ready for this commit’s code?”
      │
      │  only if: migrate concluded success
      ▼
   [ Deploy backend ]
         “build this commit → store image → point Cloud Run at it”
```

Order is intentional: **tests → schema migrate → new container**. A new revision never serves traffic against an outdated schema.

Migrate and deploy are chained with `workflow_run`. They check out the **exact commit** that passed the previous stage (`head_sha`), not whatever `main` tip is when the job starts — so a fast follow-up push cannot make deploy ship a different SHA than the one that migrated.

### Concurrency

- **CI**: cancel older runs for the same PR/ref (`cancel-in-progress: true`) — stale feedback is noise.
- **Migrate / deploy**: one at a time (`cancel-in-progress: false`) — two migrates or two deploys racing is worse than waiting.

---

## 1. CI — “is this commit safe?”

**Trigger:** push to `main`, or any pull request.

**Interaction:**

```
  GitHub runner
    → reads repo secret STAGING_DATABASE_URL
    → refuses empty / non-neon.tech hosts (no silent localhost fallback)
    → pnpm install + pnpm test against staging Neon
```

Why the fail-fast on the URL: without the secret, Actions would inject an empty `DATABASE_URL` and the suite would try localhost. The Neon serverless driver speaks WebSockets to `neon.tech`; localhost cannot work, and the failure mode is confusing. Prefer a **staging** Neon branch, never production, for this secret.

PRs stop here. Only a successful **push** CI on `main` unlocks migrate.

---

## 2. Migrate — “make production schema match this commit”

**Trigger:** CI workflow completed successfully on `main`, and that CI run was a **push** (PR green does not migrate).

**Interaction:**

```
  GitHub runner (environment: production)
    → checks out the CI head_sha
    → reads PRODUCTION_DATABASE_URL from the production environment
    → pnpm db:migrate in apps/backend
    → talks only to Neon production
```

This job does **not** touch GCP, Docker, or Cloud Run. Prefer a **direct** (non-pooler) Neon URL for `drizzle-kit migrate`; the running service can keep a pooled URL.

---

## 3. Deploy — “ship the container for that same commit”

**Trigger:** migrate workflow concluded success.

### Auth: Workload Identity Federation (no JSON key)

Old way: download a GCP service-account JSON key → park it in GitHub Secrets → Actions uses it forever. Steal the secret → steal deploy rights. Rotate forever.

WIF replaces that with a **trust handshake**:

```
  Deploy job (permissions: id-token: write)
    → GitHub mints a short-lived OIDC JWT
         (“I am this repo / production environment / this run”)
    → google-github-actions/auth sends it to Google STS
    → WIF provider (pool github / provider github-actions) checks:
         issuer is GitHub + attribute conditions (repo, preferably production env)
    → Google returns a short-lived federated token
    → that identity impersonates github-deploy@…
    → gcloud / Docker push / Cloud Run deploy run as that SA
```

Nothing long-lived for GCP sits in GitHub secrets. Trust is scoped to this repo (and ideally the `production` environment). Revoke by changing IAM / WIF conditions — not by hunting keys out of every secret store.

The deploy SA is narrow on purpose:

- `roles/artifactregistry.writer` — push images
- `roles/run.admin` — deploy the service
- `roles/iam.serviceAccountUser` on the **runtime** SA — required so deploy can attach/update the service that runs as that identity

The **running** container does not use `github-deploy@…`. It uses the Cloud Run runtime SA and Secret Manager bindings set at bootstrap.

### Build → registry → roll

Once authenticated:

```
  runner
    → docker build (repo root context, apps/backend/Dockerfile)
    → push europe-west1-docker.pkg.dev/…/backend:<sha>
         and …/backend:latest
    → layer cache in …/backend:buildcache
         (workflow_run jobs cannot use default GHA cache the same way)
    → gcloud run deploy savemyplanet-api --image …:<sha>
```

### Image-only deploys

The Action **only changes the container image**. It intentionally leaves alone:

- env vars (`NODE_ENV`, `CORS_ORIGINS`, …)
- secret bindings
- request timeout
- ingress / `--allow-unauthenticated`

Day-to-day shipping is “new code, same runtime config.” Changing secrets or CORS is a one-off `gcloud run deploy` (or Console edit), not a GitHub workflow edit.

---

## What the container actually is

`apps/backend/Dockerfile` is multi-stage Node 22 + pnpm:

1. **build** — full monorepo install, `pnpm --filter backend build`
2. **runtime** — copy the built tree, `WORKDIR` → `apps/backend`, `CMD ["node", "dist/index.js"]`

Interactions at boot:

```
  Cloud Run
    → sets PORT (usually 8080); the app reads process.env.PORT
    → injects secrets / env from the service config (not from the image)
    → starts node dist/index.js
         (plain node — no pnpm/corepack — so cold start does not hit the npm registry)
```

Do **not** routinely run `gcloud builds submit` by hand; CI owns build + push.

---

## Runtime: who talks to whom after deploy

```
  Expo / browser
    → HTTPS → Cloud Run (savemyplanet-api)
         → Neon (DATABASE_URL, prefer pooled)
         → Clerk / Stripe / OpenRouter / Klima x402 (outbound HTTPS)
```

| Kind | Names |
| --- | --- |
| Secrets (Secret Manager → Cloud Run) | `DATABASE_URL`, Clerk keys + webhook secret, Stripe keys + webhook secret, `KLIMA_PAYER_PRIVATE_KEY`, `OPENROUTER_API_KEY`, `ADMIN_API_KEY` |
| Plain env | `NODE_ENV=production`, `CORS_ORIGINS=…` |

Production **must not** use `CORS_ORIGINS=*` — the process exits on boot (`*` is local-dev only). Use a comma-separated HTTPS/HTTP allowlist. Native Expo clients do not rely on CORS; the allowlist is for browser callers.

---

## One-time GCP setup (already done for this project)

Recreating from scratch is wiring the cast so the handshakes above work:

1. **Enable APIs:** Cloud Run, Artifact Registry, IAM Credentials, STS (WIF token exchange).
2. **Artifact Registry:** Docker repo `savemyplanet` in `europe-west1`.
3. **Deploy SA** `github-deploy@…` with the roles listed above.
4. **Workload Identity Federation** so GitHub can impersonate that SA:
   - Pool id: `github`
   - Provider id: `github-actions`
   - Restrict the principal set to this GitHub repo (and preferably the `production` environment)
   - Provider resource name must match the workflow string in the coordinates table
5. **GitHub secrets:** Environment `production` → `PRODUCTION_DATABASE_URL` (migrate). Repo secret `STAGING_DATABASE_URL` (CI).
6. **Bootstrap** the Cloud Run service once (secrets, timeout, CORS, public access). After that, Actions only roll the image.

### Bootstrap example

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

`--timeout=60` matches waiting on Klima x402 inside a single request (raise later if retirements need longer).

---

## Operational expectations

- **Cold starts:** scale-to-zero Cloud Run (~2–5s) plus idle Neon wake (~500ms). The mobile app should show a loading state, not a hard short timeout.
- **Regions:** keep Cloud Run and Neon in Europe. Moving the API to a US region means moving Neon too.
- **Outbound:** the service must reach `https://x402.klimalabs.com/` (and Clerk, Stripe, OpenRouter).
- **Clients:** Expo uses the Cloud Run HTTPS URL (`EXPO_PUBLIC_API_URL` when mobile exists). No x402 from the client.
- **Rate limits:** in-memory per Cloud Run instance (fine for v1; shared Redis later if multi-instance limits matter).

---

## Troubleshooting cheat sheet

| Symptom | What broke in the handshake |
| --- | --- |
| CI fails immediately on “STAGING_DATABASE_URL” | Repo secret missing, empty, or not a `neon.tech` URL |
| Migrate never runs after a green PR | Migrate only follows **push** CI on `main`, not PRs |
| Deploy never runs | Migrate failed or was skipped; deploy watches that workflow’s conclusion |
| New code live but wrong env/secrets | Deploy is image-only — check the service config / Secret Manager, not the Dockerfile |
| Container crashes on boot about CORS | `CORS_ORIGINS=*` (or empty) in production |
| Auth errors from GitHub → GCP | WIF provider name, SA roles, or repo/environment attribute condition mismatch |
