# Implementation plan

Build **backend first**, then a **staging** API + Expo web demo, then the Expo app against a frozen API. Do not start full native Phase M until Phase B is shippable on Cloud Run (or equivalent local Docker), [Phase S](#phase-s--staging) can host end-to-end demos without real Klima spend, and the contract in [API contract](#api-contract-freeze-before-mobile) is stable.

Chosen stack and hosts: [architecture.md](architecture.md), [hosting.md](hosting.md). Retirement mechanics: [x402.md](x402.md). Product rules: [product.md](product.md).

**Regions (Europe).** Colocate the API and the DB. The mobile app talks only to Cloud Run; Klima x402 can stay a cross-ocean hop.

| Component | Location |
| --- | --- |
| Neon | AWS `eu-central-1` (Frankfurt) |
| Cloud Run | `europe-west1` (Belgium), or `europe-west9` (Paris) |

Mark a phase `[x]` only when its **Done when** is true. Check off bullets as they land. Do not check a phase early because related files exist.

## Sequence

```
0. Monorepo
   → B. Backend (local → Neon → Cloud Run)
     → S. Staging (API + Expo web)
       → API freeze
         → M. Mobile (Expo Go → EAS)
```

---

## Phase 0 — Monorepo

- [x] **Done when:** `pnpm --filter backend dev` serves `GET /health` and connects to the remote Neon project.

Create the repo layout before any feature work. Initialize the Neon project to ensure the DB infrastructure is ready. Set up a Clerk application for authentication.

```
apps/backend/     # Hono + Drizzle + viem
apps/mobile/      # created in Phase M, not now
packages/         # add only when backend and mobile would duplicate types
pnpm-workspace.yaml
turbo.json
```

- [x] pnpm workspaces + Turborepo: `dev`, `build`, `lint`, `typecheck`.
- [x] Node 22, TypeScript strict.
- [x] Neon: Cloud project in **AWS `eu-central-1` (Frankfurt)**, `DATABASE_URL` ready.
- [x] Clerk: Application created, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` ready.
- [x] Root `.env.example` listing backend secrets (Neon, Clerk, Klima, etc.). No private keys in git.
- [x] `apps/backend/Dockerfile` (Node, `@hono/node-server`) from day one so Cloud Run is not a rewrite.
- [x] `GET /health` served by `apps/backend`.
- [x] Health (or startup) actually connects to the remote Neon project.

---

## Phase B — Backend

Hono stays thin. Markup, ledger, evaluation, and x402 live in plain modules (`src/pricing`, `src/ledger`, `src/evaluate`, `src/klima`).

### B1. HTTP skeleton

- [x] **Done when:** health works locally and in Docker.

- [x] Hono app; `GET /health` → `{ ok: true }`.
- [x] CORS for later Expo (configure allowed origins; `*` only in local dev).
- [x] Structured errors: `{ error: string, details?: unknown }`. Never leak Klima wholesale fields on user routes.
- [x] Health verified in Docker.

### B2. Database

- [x] **Done when:** migrate against Neon from a clean database.

Neon Postgres + Drizzle. Schema (minimum):

| Table | Purpose |
| --- | --- |
| `users` | id, clerk_id (unique), email, available_cents, reserved_cents (integer USD cents), created_at; **B7b** adds `evaluations_remaining` (default 10) |
| `ledger_entries` | immutable credits/debits: funding, reserve, capture, release; includes `retirement_id`; **F1** adds Stripe fee/net/FX on funding rows |
| `quotes` | snapshot of user-facing price (tonnes, markup_bps, user_total, klima_total stored **server-only**, expiry) |
| `retirements` | state machine + certificate URL, tx hash, tonnes, attribution; **F2** adds Klima auth/spend (server-only) |
| `evaluations` | optional audit of activity text → suggested tonnes; **B7c** adds OpenRouter cost / usage |

`beneficiaryAddress` is **not** a stored column: derive it deterministically from `users.id` (UUID → checksummed EVM address) in B7b. Same UUID always yields the same address.

Balances change **only** via ledger entries. Do not `UPDATE users.available_cents` without a matching ledger row.

- [x] Drizzle table definitions for the schema above.
- [x] Migrations via Drizzle. We connect directly to the remote Neon project for all environments.

### B3. Auth

- [x] **Done when:** registration/login via Clerk works; authenticated `GET /me` returns user info from the database (synced from Clerk) + balance.

- [x] Use **Clerk** for identity.
- [x] `Authorization: Bearer` (Clerk JWT) on all account routes.
- [x] Backend validates JWT via `@clerk/backend` and Hono middleware. (Mobile Clerk SDK lands in Phase M.)
- [x] Sync users from Clerk to the `users` table via **webhooks**.

### B4. Ledger and funding (Stripe)

- [x] **Done when:** Stripe payment → balance increases via webhook.

- [x] `GET /account` → available, reserved, currency (`USD`).
- [x] `POST /account/deposit` (Stripe Checkout/PaymentIntent): presentment `usd` or `eur`; webhook credits **USD cents** only (convert EUR once; store presentment amount/currency + credited cents on the funding ledger row). Credit **gross** (user pays X → X available); Stripe fees absorbed and recovered via markup ([product.md](product.md)). Minimum deposit **500** minor units ($5 / €5).
- [x] `POST /account/credit` (dev/admin) for manual overrides (USD cents).
- [x] Refuse retirement when `available < marked_up_total`.

### B5. Klima client (read-only)

- [x] **Done when:** a script or admin route can print discover + a 1 t quote without exposing it on user APIs.

Vendor or install `@klimadao/x402-retire` / `klima-retire.ts`. Wrap it:

- [x] `discover()` / `quote()` only in this phase. No signing yet.
- [x] Config: `KLIMA_BASE_URL=https://x402.klimalabs.com`, `chainId=8453` (use `84532` only if we explicitly test Sepolia).
- [x] Input token: USDC.
- [x] Map Klima errors to our errors. Log wholesale `total` server-side only.

### B6. User quote (markup)

- [x] **Done when:** two quotes for the same tonnes differ only by live Klima price; response never includes wholesale.

`POST /quotes`

1. Validate tonnes (≥ 0.001). Never quote or retire whole-tonne-only classes (e.g. Toucan Puro) — filter them out of discover/`GET /classes` per [product.md](product.md).
2. Backend picks carbon class (discover + cap) from the allowed set.
3. x402 `/quote` → `klima_total`.
4. `user_total = klima_total * (1 + MARKUP_BPS / 10000)` (document rounding: round **up** in the user’s favor to cents so we never under-charge).
5. Persist quote with short TTL (e.g. 10 minutes). Return **only** user-facing fields: tonnes, `user_total`, currency (`USD`), expires_at, quote_id. No `klima_total`, no `humanSummary` from Klima.

- [x] `POST /quotes` (auth): validate tonnes; discover + optional price cap / optional `carbonClass`; Klima wholesale + markup (ceil to cents); persist with TTL; return `{ quoteId, carbonClass, tonnes, userTotal, currency, expiresAt }` only.

### B7. Evaluate activity (LLM)

- [x] **Done when:** natural language "I drove 100km" returns a valid tonnage.

`POST /evaluations` `{ activity: string }` → `{ suggestedTonnes, rationale, evaluationsRemaining }`.

- [x] Backend calls LLM (OpenRouter) with a system prompt to extract tonnage from activity text.
- [x] No heuristic estimate: if the LLM fails or is ambiguous, return an error (no invented tonnage).

### B7b. Evaluation quota + user beneficiary address

- [x] **Done when:** new users have 10 evaluations; each success decrements; zero blocks `POST /evaluations`; a settled retirement resets to 10; `GET /me` exposes remaining count + derived `beneficiaryAddress`.

Product rules: [product.md](product.md) (quota + default beneficiary).

- [x] Migration: add `users.evaluations_remaining` integer NOT NULL default **10**; backfill existing rows to 10. Named migration (e.g. `--name add_evaluations_remaining`).
- [x] Helper: derive `beneficiaryAddress` from `users.id` (deterministic UUID → EVM address). Unit-test stability (same id → same address).
- [x] `GET /me` (and account shape if needed): include `evaluationsRemaining` and `beneficiaryAddress` (never `clerkId`).
- [x] `POST /evaluations`: if `evaluations_remaining <= 0` → `403`/`409` with a clear error (no LLM call). On LLM success: decrement by 1 in the same transaction as the audit row; response includes updated `evaluationsRemaining`.
- [x] Failed / ambiguous LLM responses do **not** consume quota.
- [x] Tests: quota gate, decrement on success, no decrement on LLM failure, `/me` fields.

### B7c. Persist OpenRouter evaluation costs

- [x] **Done when:** each successful `evaluations` row stores the OpenRouter call’s cost (USD) so we can sum spend per evaluation / over time; failed or ambiguous calls that do not insert a row do not invent cost rows. Cost fields stay **server-only** (not on the frozen `POST /evaluations` response).

- [x] Migration: add nullable cost/usage columns on `evaluations` (named, e.g. `--name add_evaluation_openrouter_cost`). Prefer storing OpenRouter’s reported cost when present, plus model id and token counts when returned (`prompt` / `completion` / `total`).
- [x] `callOpenRouter` / `callLlm`: parse `usage` (and cost if OpenRouter includes it) from the chat-completions response; do not drop it when reading `choices[].message.content`.
- [x] On successful evaluate persist: write cost/usage onto the new `evaluations` row in the same transaction as the audit insert + quota decrement.
- [x] Tests: mocked OpenRouter response with usage/cost → DB re-read shows stored values; missing usage still allows a successful evaluation (cost columns null).

### B8. Retire (orchestration)

- [x] **Done when:** (testnet or tiny mainnet amount) funded user retires; balance drops by **user_total**; certificate URL stored; a forced Klima failure refunds the reserve; settled success resets evaluations to 10.

`POST /retirements` `{ quoteId, beneficiaryString, retirementMessage? }`

**Beneficiary address:** do not require the client to send `beneficiaryAddress`. On retire, set Klima `details.beneficiaryAddress` to the address derived from the user’s UUID ([product.md](product.md)). `beneficiaryString` remains the human-readable certificate name from the client.

State machine:

```
reserved → submitted → settled
                    ↘ pending_index → settled (certificate indexed later)
          ↘ released (Klima failed / expired quote)
```

1. Load quote; 400 if expired or already used.
2. If `available < user_total` → `402`/`409` insufficient_funds.
3. **Reserve** `user_total` (available ↓, reserved ↑, ledger `reserve`).
4. Sign + relay via Klima (`retire()` / prepare-auth → actions/retire) from the **service wallet**, using the user’s derived `beneficiaryAddress`.
5. On Klima `settled`: ledger `capture`, store tx hash + certificate; set `users.evaluations_remaining = 10`.
6. On Klima `pending_index`: ledger `capture`, store tx hash, status `pending_index` (no certificate yet); also set `users.evaluations_remaining = 10`.
7. On Klima failure: ledger `release`, reserved ↓, available ↑. User is not charged; **do not** reset evaluation quota.

Dry-run / test retirements use the **staging environment** ([Phase S](#phase-s--staging)): Stripe test + Clerk development + Neon development + **fake** Klima retire calls. Production never fakes retirements.

Service wallet: `KLIMA_PAYER_PRIVATE_KEY` only on the server (required for real retires; staging fake mode does not spend USDC). USDC on Base; no ETH required for relay.

Timeouts: Cloud Run request timeout ≥ Klima wait (start at 60s, raise if needed). If we still hit limits, only then split into `202` + `GET /retirements/:id` polling — that is an explicit follow-up, not v1.

- [x] Tests: success path resets evaluations to 10; Klima failure leaves remaining unchanged.
- [x] **Follow-up:** background/job or on-read retry for `pending_index` rows — poll Klima `/certificate` by `txHash`, store `certificateUrl`, flip status to `settled`.
- [x] **Follow-up:** reconcile when Klima succeeds on-chain but local `capture`/settle then fails — row can stick at `submitted` with funds still reserved; recover tx hash, capture, and move to `settled` / `pending_index`.
- [x] **Follow-up (side plan C):** C1–C4 done (C5 deferred). See [Side plan — Retirement concurrency + Klima wallet safety](#side-plan--retirement-concurrency--klima-wallet-safety).

### B9. Retirement history

- [x] **Done when:** settled row matches Carbonmark URL from x402.

- [x] `GET /retirements` list for the user.
- [x] `GET /retirements/:id` status + certificate URL when settled.

### B10. Deploy backend

- [ ] **Done when:** register → credit (admin) → quote → retire works against the deployed API with a funded service wallet. Record the public base URL for mobile.

- [x] Neon project in AWS `eu-central-1` (Frankfurt) + migrate. Production migrate: GitHub Action after CI on `main`; Environment `production`, secret `PRODUCTION_DATABASE_URL` (direct Neon URL). See [hosting.md](hosting.md).
- [x] Cloud Run in `europe-west1` (Belgium) or `europe-west9` (Paris): image from `apps/backend/Dockerfile` via GitHub Action (build/push Artifact Registry + deploy after migrate on `main`); secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `KLIMA_PAYER_PRIVATE_KEY`). See [hosting.md](hosting.md).
- [x] Outbound HTTPS to `x402.klimalabs.com` and OpenRouter allowed.
- [x] `GET /health` on the `*.run.app` URL.

---

## Phase S — Staging

Shared demo / integration environment before (and while) building mobile. Staging spends **no** real Klima USDC; production remains the only place that retires on-chain.

### S1. Staging API

- [ ] **Done when:** a Cloud Run staging service serves the full HTTP contract against Neon development + Clerk development + Stripe test; `POST /retirements` completes the ledger/state machine with **fake** Klima retire (no x402 spend); production still refuses fake mode.

- [x] Neon **development** database (or dedicated branch), not production. Migrate via a staging workflow / GitHub Environment secret (e.g. `STAGING_DATABASE_URL` — already used by CI tests; prefer the same or a sibling branch).
- [x] Cloud Run service distinct from production (e.g. `savemyplanet-api-staging`) in the same Europe region. Bootstrap secrets/env separately.
- [x] **Deploy trigger:** on **push to the `staging` git branch**, CI → migrate staging Neon → build/push image → deploy the staging Cloud Run service (same CI → migrate → deploy order as production on `main`). Document workflows in [hosting.md](hosting.md). Pushes to `main` must not update staging.
- [ ] **Clerk development** application (or Clerk “development” instance keys). Webhook endpoint points at the staging `*.run.app` URL.
- [ ] **Stripe test** mode keys + test webhook secret; Checkout/PaymentIntent + funding webhook credit USD cents the same as production.
- [x] **Fake retirements:** env-gated Klima retire stub (e.g. `KLIMA_RETIRE_MODE=fake` or equivalent). Staging: `retire()` returns a synthetic settled (or pending_index) result with fake tx hash / certificate URL; ledger reserve → capture (or release on forced failure) still runs for real. Unset / non-fake: real x402 only. **Boot must fail** if fake mode is enabled on the production Cloud Run service (hard guard — do not rely on “just don’t set the flag”).
- [x] Discover/quote use live Klima **reads** (no spend). Fake mode applies only to **retire**.
- [x] `CORS_ORIGINS` allowlist includes the Expo web staging origin (S2). No `*`.
- [x] Record the staging base URL for the Expo app (`EXPO_PUBLIC_API_URL`).

### S2. Expo web → staging API

- [ ] **Done when:** an Expo **web** build is hosted on a **Cloudflare Workers** static-assets Worker and talks only to the staging API URL; sign-in (Clerk), health, and at least evaluate → quote → confirm retire (fake) works in a browser.

- [x] Create `apps/mobile` early enough for web (can precede full native Phase M polish): Expo + TypeScript + Expo Router with web enabled.
- [x] Config: `EXPO_PUBLIC_API_URL` = staging Cloud Run URL. No Klima URLs or private keys in the client.
- [x] Clerk Expo/web with the **development** publishable key matching S1.
- [x] **Deploy trigger:** on **push to the `staging` git branch**, export web (`npx expo export --platform web`) and deploy via **`wrangler deploy`** to Worker **`clearmycarbon-staging`** (same branch that deploys the staging API). Document the workflow in [hosting.md](hosting.md). Pushes to `main` must not update the staging web deploy.
- [x] Add the Cloudflare Worker HTTPS origin to staging `CORS_ORIGINS` (see [hosting.md](hosting.md)). Confirm after first `*.workers.dev` URL / custom domain is known.
- [x] Cold-start tolerance (spinner/retry) same as native later.

Native Expo Go / EAS (Phase M) should default to the same staging API until a production mobile cutover is explicit.

---

## API contract (freeze before mobile)

User-facing JSON. Field names are the freeze; change only with a version bump.

| Method | Path | Auth | Success |
| --- | --- | --- | --- |
| GET | `/health` | no | `{ ok: true }` |
| POST | `/auth/register` | no | handled by Clerk UI |
| POST | `/auth/login` | no | handled by Clerk UI |
| GET | `/me` | yes | `{ user, account }` — `user` includes `evaluationsRemaining`, `beneficiaryAddress` |
| GET | `/account` | yes | `{ available, reserved, currency }` |
| POST | `/account/deposit` | yes | `{ clientSecret, paymentIntentId }` (presentment `usd` \| `eur`) |
| POST | `/account/credit` | admin | `{ account }` (v1 funding) |
| POST | `/evaluations` | yes | `{ suggestedTonnes, rationale, evaluationsRemaining }` (403/409 if quota exhausted) |
| GET | `/classes` | yes | `{ classes: [...] }` (list Klima classes) |
| POST | `/quotes` | yes | `{ quoteId, carbonClass, tonnes, userTotal, currency, expiresAt }` |
| POST | `/retirements` | yes | `{ id, status, createdAt, certificateUrl? }` (server sets `beneficiaryAddress` from user UUID; body still takes `beneficiaryString`) |
| GET | `/retirements` | yes | `{ items: [...] }` |
| GET | `/retirements/:id` | yes | `{ id, status, tonnes, userTotal, certificateUrl?, txHash? }` |

`account.available` / quote `userTotal` are **marked-up**. Wholesale Klima amounts never appear.

After B10, treat this table as the mobile source of truth. Put shared types in `packages/api-types` only when the Expo app exists and would otherwise copy them.

---

## Phase M — Mobile

Expo app talks **only** to our backend (config: `EXPO_PUBLIC_API_URL`). Default target: **staging** API from [Phase S](#phase-s--staging). No Klima URLs, no private keys, no wholesale prices. Web preview may already exist from S2; Phase M completes native flows and hardens the same app. Screens and flows: [ux.md](ux.md).

### M1. App shell

- [x] **Done when:** Expo Go (and web if S2 landed) hits staging `/health`.

- [x] Expo + TypeScript, Expo Router (reuse S2 app if present).
- [x] Auth storage (secure store) for JWT (managed by Clerk).
- [x] API client typed from the frozen contract.
- [x] Tolerate Cloud Run/Neon cold start on first request (retry/spinner, not a 3s hard fail).

### M2. Auth and account

- [ ] **Done when:** a user can sign in and see balance after an admin credit.

- [ ] register, login, logout via Clerk Expo SDK.
- [ ] Home: available balance, reserved if any; show `evaluationsRemaining` from `/me`.
- [ ] Deposit: Stripe payment sheet.

### M3. Evaluate

- [ ] **Done when:** suggestion appears without a funded account (auth still required if the API requires it; if we want evaluate logged-out, add that to the contract **before** this screen).

- [ ] Text field for the activity.
- [ ] Show `suggestedTonnes` + rationale; update remaining count from the response.
- [ ] Prefill the retirement amount; user can edit.
- [ ] When quota is zero: disable evaluate (or show clear error) and nudge toward retirement to reset.

Default: evaluation requires auth (simpler). Logged-out evaluate is a later contract change.

### M4. Quote and confirm retire

- [ ] **Done when:** confirm retires and the UI does not show Klima’s total.

- [ ] Browse `/classes` and select one.
- [ ] Request `/quotes` for the chosen tonnes + class.
- [ ] Show **our** price (marked-up), tonnes, beneficiary name (`beneficiaryString`). Do not ask the user for a wallet/`beneficiaryAddress` — backend applies the UUID-derived default.
- [ ] Explicit Confirm control in the UI before calling `POST /retirements`.
- [ ] Errors: insufficient funds → prompt to deposit (Stripe).
- [ ] After settled retirement: refresh `/me` so evaluation quota shows 10 again.

### M5. Certificate

- [ ] **Done when:** history shows a settled item with a working certificate link.

- [ ] Status for in-flight retirements.
- [ ] Open/share Carbonmark `certificateUrl` when settled.
- [ ] History list from `GET /retirements`.

### M6. EAS

- [ ] **Done when:** a preview APK/IPA (or Expo Go project) runs the full flow against **staging**: evaluate → quote → confirm → certificate (fake retire).

- [ ] `eas.json` development + preview profiles.
- [ ] Point preview builds at the **staging** Cloud Run URL (`EXPO_PUBLIC_API_URL`).
- [ ] Keep / refresh the Expo **web** staging deploy on Cloudflare Workers from S2 as part of preview.
- Store listing (Apple/Google) is **out of this plan** (paid accounts).

---

## Out of this plan

- User-held wallets / client x402
- Picking specific credit tokens (users only pick Klima classes)
- Async retire (`202`) unless Cloud Run timeouts force it
- App Store / Play production release
- Admin console UI (admin credit via HTTP is enough)

---

## Side plan — Endpoint tests (catch-up)

Does **not** block B7–B10 or API freeze. Goal: cover every **existing** route with colocated tests (`routes/….test.ts`), per [AGENTS.md](../AGENTS.md). New routes still ship with tests in the same PR.

### T0. Harness

- [x] **Done when:** `pnpm --filter backend test` runs and one sample route test passes in CI/local.

- [x] Vitest (or equivalent) + `test` script in `apps/backend`.
- [x] Shared helpers: build app, auth stub (Bearer → test user), DB (Neon branch or transactional cleanup), mocks for Stripe / Klima / Clerk webhook verify.
- [x] MSW network guard in Vitest setup: outbound HTTP fail-closed except Neon/DB hosts; Stripe/Klima/OpenRouter/Clerk must be module-mocked.
- [x] Pattern: success + important failures (401, 400 validation, domain errors). No wholesale Klima fields in user responses.

### T1. Existing routes

- [x] **Done when:** each file below has a colocated `*.test.ts` with the cases noted.

| Route file | Endpoint | Cover at least |
| --- | --- | --- |
| `routes/health.ts` | `GET /health` | 200 `{ ok: true }` |
| `routes/me.ts` | `GET /me` | 401; 200 `{ user, account }` (no `clerkId`) |
| `routes/account/index.ts` | `GET /account` | 401; 200 balance shape |
| `routes/account/deposit.ts` | `POST /account/deposit` | 401; min amount / currency validation; 200 `{ clientSecret, paymentIntentId }` (Stripe mocked) |
| `routes/account/credit.ts` | `POST /account/credit` | 401/forbidden non-admin; 200 credits balance |
| `routes/quotes.ts` | `POST /quotes` | 401; tonnes validation; 200 user-facing quote only (Klima mocked; no `klima_total`) |
| `routes/webhooks/clerk.ts` | `POST /webhooks/clerk` | bad signature rejected; user sync on valid event |
| `routes/webhooks/stripe.ts` | `POST /webhooks/stripe` | bad signature rejected; funding credits USD cents on valid PaymentIntent |

After T1, keep the AGENTS rule: every new route lands with its colocated test.

## Side plan — Network throttling

Does **not** block B8–B10 or API freeze. Goal: rate-limit **every** HTTP route via [`hono-rate-limiter`](https://www.npmjs.com/package/hono-rate-limiter) without changing the frozen success contract shape (`429` is an allowed error).

### N1. Request throttling (`hono-rate-limiter`)

- [x] **Done when:** every mounted route uses a limiter; over-limit callers get `429` with `{ error, details? }` (and `Retry-After` when the library sets it); within-limit traffic unchanged; tests cover allow + deny for at least one read and one write route.

- [x] Depend on `hono-rate-limiter`. Default store: in-memory (Cloud Run best-effort per instance). Document that multi-instance shared limits need Redis (or similar) later — not v1.
- [x] Key: authenticated user id when present; otherwise client IP (health, webhooks). Do not use `clerkId` in response bodies.
- [x] Apply limiters on **all** routes (route-local or path-prefix middleware). Sensible starting windows (fixed window, per key):

| Route(s) | Limit | Window | Why |
| --- | --- | --- | --- |
| `GET /health` | 120 | 1 min | Probes + cold-start retries; still capped |
| `GET /me`, `GET /account`, `GET /classes`, `GET /retirements`, `GET /retirements/:id` | 60 | 1 min | Normal app polling / navigation |
| `POST /account/deposit` | 10 | 1 min | Stripe Checkout spam |
| `POST /account/credit` | 20 | 1 min | Admin only; still bound |
| `POST /evaluations` | 10 | 1 min | LLM cost |
| `POST /quotes` | 20 | 1 min | Klima wholesale calls |
| `POST /retirements` | 5 | 1 min | Irreversible + Klima relay |
| `POST /webhooks/clerk`, `POST /webhooks/stripe` | 120 | 1 min | Provider retries; key by IP |

- [x] Handler / status: HTTP `429`, body `{ error: string, details?: unknown }` consistent with other structured errors.
- [x] Tests: under limit → success path unchanged; over limit → 429; other keys unaffected.

## Side plan — Financial cost persistence (audit gaps)

Does **not** block B10, Phase S, API freeze, or mobile. Goal: close the **high** and **medium** gaps from the financial audit so Postgres can support contribution margin without Stripe Dashboard / chain archaeology. Fields stay **server-only** (never on the frozen user API). Product rule unchanged: deposits still credit **gross**; fees are recorded for P&L, not deducted from `available_cents` ([product.md](product.md)).

Gaps closed here:

| Severity | Gap | Closed by |
| --- | --- | --- |
| High | Stripe processing fees not in DB | F1 |
| Medium | EUR FX rate not auditable | F1 |
| Medium | Quoted Klima ≠ proven USDC spend | F2 |

Low gaps (naive `SUM(quotes)`, manual admin credits) stay out of this side plan.

### F1. Persist Stripe fee + FX on funding

- [x] **Done when:** every successful Stripe-funded `ledger_entries` row (`type = funding` with a PaymentIntent) stores settlement fee, net, and (when non-USD) the FX rate used for the gross USD credit; USD deposits also expand `balance_transaction` (not EUR-only); manual `POST /account/credit` rows leave fee/FX columns null; user HTTP responses unchanged.

- [x] Migration (named, e.g. `--name add_funding_stripe_settlement`): on `ledger_entries`, nullable columns for funding rows only, e.g.:
  - `stripe_fee_cents` (integer) — fee in **settlement** currency minor units (USD cents when platform settles in USD)
  - `stripe_net_cents` (integer) — net after fees in settlement currency
  - `stripe_exchange_rate` (numeric, nullable) — Stripe `balance_transaction.exchange_rate` when presentment ≠ settlement; null for pure USD
  - Optional: `stripe_balance_transaction_id` (text) for Stripe Dashboard join
- [x] `usdCentsFromPaymentIntent` / `creditFromPaymentIntent`: for **both** USD and EUR, retrieve the charge with `expand: ['balance_transaction']`. Keep gross credit math as today (presentment × rate for EUR; presentment for USD). Additionally persist `fee`, `net`, and `exchange_rate` from the balance transaction onto the funding insert. Refuse/fail closed if fee/net missing on a real Stripe funding path (same class of errors as missing charge today).
- [x] Do **not** change credit amount: still gross → `amount_cents` / `available_cents`. Fee columns are audit-only.
- [x] `creditFundingManual` / admin credit: omit Stripe settlement columns (null).
- [x] Tests: mocked PaymentIntent + balance_transaction (USD fee/net; EUR fee/net + exchange_rate) → DB re-read shows columns; idempotent webhook replay does not invent a second row; admin credit still works with nulls. No fee fields on deposit/account JSON.

### F2. Persist actual Klima USDC authorization on retire

- [x] **Done when:** each retirement that reaches Klima success (`settled` or `pending_index`) stores the USDC authorization ceiling used at retire time (and, when available, any post-retire quote/total from the Klima result) so COGS can use **actual auth** vs `quotes.klima_total_cents`; released / failed retires do not invent spend rows; fake mode either stores a documented synthetic value or null consistently; user HTTP responses unchanged (no wholesale).

- [x] Migration (named, e.g. `--name add_retirement_klima_spend`): on `retirements`, nullable server-only columns, e.g.:
  - `klima_auth_value_micros` (numeric/text integer string) — EIP-3009 / prepare-auth `authValue` (USDC 6-decimal base units), the signed ceiling
  - `klima_auth_value_cents` (integer) — ceil to cents for easy SUM (same rounding spirit as quotes)
  - Optional: `klima_retire_total_micros` if `RetireResult.quote` (or equivalent) exposes a firm total distinct from auth ceiling
  - Optional: `klima_quoted_total_cents` denormalized copy of the quote’s `klima_total_cents` at settle time (snapshot join-safety if quotes were ever mutated — quotes are immutable today; skip if redundant)
- [x] Klima client: capture `authValue` from `prepare-auth` (vendor `onStep('sign', …)` and/or typed prepare response). Prefer integer micros over formatted strings. Thread through `KlimaRetireResult` (real path). Fake path: set auth fields to match the linked quote’s `klima_total` micros **or** leave null — pick one, document in code comment, test it.
- [x] Orchestration (`executeRetirement` / `settleRetirement`): on Klima success, persist auth (and optional retire-total) on the `submitted` row with the tx hash **before** capture/settle (so a settle failure still keeps spend for reconcile); settle leaves those columns untouched while flipping status → `settled` / `pending_index`. On release/failure: leave spend columns null.
- [x] P&L convention (document in a short comment near schema or settle): **quoted COGS** = `quotes.klima_total_cents`; **authorized COGS** = `retirements.klima_auth_value_cents` (ceiling; unused budget may refund on-chain — note that true post-refund spend may still need chain/indexer later). Contribution margin ≈ `user_total` − authorized (or quoted) − Stripe fees − OpenRouter.
- [x] Tests: mocked real retire with known `authValue` → DB re-read; fake retire behavior matches chosen convention; failure → release with null spend columns; `GET /retirements/:id` still has no wholesale fields.

## Side plan — Retirement concurrency + Klima wallet safety

Does **not** block Phase S (fake retire), API freeze, or mobile. **Should land before** treating production real Klima retires as safe under concurrent users (B10 Done when / post-B10 load). User-ledger concurrency (quote uniqueness, conditional `available`/`reserved` updates, settle CAS) is already correct — this plan closes the **shared service-wallet** and **ambiguous Klima outcome** gaps from the retirement concurrency audit.

Gaps closed here:

| Severity | Gap | Closed by |
| --- | --- | --- |
| High | Parallel `klimaRetire()` oversubscribes one `KLIMA_PAYER` USDC balance (EIP-3009 nonces do **not** collide; balances do) | C1 (headroom gate) |
| High | Klima timeout / network error → `releaseReserved` after an on-chain success (user refunded + credits burned) | C2 |
| Medium | Crash after Klima success before `txHash` persist → `submitted` with null hash; reconcile cannot recover | C3 |
| Low | Ledger / `tx_hash` invariants are CAS-only, not structural UNIQUE constraints | C4 |
| Low | In-memory retirement rate limit is per Cloud Run instance | C5 (optional; headroom is C1) |

EIP-3009 / Klima `salt` is **out of scope** to “fix”: we do not mint nonces; Klima `prepare-auth` returns salt and we relay it verbatim ([x402.md](x402.md)).

### C1. Headroom gate — parallel Klima OK until wallet would overspend

**Chosen approach:** do **not** serialize every real `retire()`. Allow concurrent prepare-auth → relay when headroom remains; **queue or fail closed only when** this retirement’s expected Klima ceiling plus currently in-flight (`submitted`) spend would exceed **live** service-wallet USDC.

- [x] **Done when:** two real retires whose combined ceilings fit under wallet headroom can call Klima in parallel; a third (or any) that would oversubscribe is blocked **before** calling Klima (wait for headroom or structured `503`/`429`); the headroom **claim** is atomic across Cloud Run instances; budget always uses a **live on-chain USDC balance** read (no cache); fake mode skips the gate; user success JSON unchanged.

- [x] **In-flight set:** retirements in status `submitted` (and only those). Sum expected USDC as:
  - `klima_auth_value_cents` when already persisted, else
  - linked quote `klima_total_cents` (or that value × a small safety factor / documented pad — prefer over-reserving headroom vs under).
- [x] **Wallet budget:** **always** read the service wallet’s **live** USDC `balanceOf` on Base (RPC) at claim time. Do **not** use a cached/TTL balance. Budget is live balance alone (no env hard cap).
- [x] **Claim (short critical section for DB accounting, not full Klima duration):** after local reserve, **before** Klima (prefer before or atomically with `reserved → submitted` so a busy gate can `release` cleanly):
  1. Fetch **live** USDC balance (outside or just before the DB lock — RPC is not inside a long-held DB txn).
  2. In one DB transaction (advisory lock **or** `FOR UPDATE` on a single gate row — milliseconds only): sum in-flight expected spend for other `submitted` rows; compare `in_flight + this_ceiling` to the live-derived budget from step 1.
  3. If over budget → do **not** call Klima: wait/retry with timeout, or fail closed with a structured error (prefer fail-fast over holding user HTTP for Cloud Run’s full timeout). Coordinate with C2/C3 so a refused gate does not leave a zombie `submitted` without an attempt marker.
  4. If headroom OK → commit so this row counts in the in-flight sum; **release the short lock**; then call `klimaRetire()` (parallel with other admitted retires).
- [x] When Klima returns (success → settle, or definitive failure → release), that row leaves `submitted` and frees headroom for waiters.
- [x] Document near orchestration: EIP-3009 nonces stay independent; this gate only protects **USDC balance**. Stuck `submitted` (C2 ambiguous) continues to consume headroom until reconcile — intentional.
- [x] Tests: (1) two concurrent retires under mocked live balance → both invoke Klima; (2) concurrent pair that would overspend → only one admits, other gets structured busy/insufficient-wallet error without a Klima call; (3) fake mode parallel unchanged; (4) after first settles, a previously blocked size can proceed; (5) balance helper is called on each claim (no cache hit path).

### C2. Never release on ambiguous Klima failure

- [x] **Done when:** timeout, abort, and network-class Klima errors leave the retirement **`submitted`** (funds stay reserved) for reconcile — they do **not** call `releaseReserved`; only **definitive** Klima failures (explicit 4xx/business errors that prove no relay) release; user HTTP may still surface `502`/`504`, but GET history / reconcile can finish capture when a tx appears.

- [x] Classify Klima / vendor errors in one place (`mapKlimaError` or a small helper): `definitive_failure` vs `ambiguous` (timeout `408`, `network_error`, abort, 5xx from relay after prepare-auth, unknown).
- [x] `executeRetirement` catch path:
  - **Definitive** → existing `releaseReserved` + rethrow (unchanged product: user not charged).
  - **Ambiguous** → do **not** release; leave `submitted` (tx hash may still be null); log loudly; rethrow a distinct error code (e.g. `klima_outcome_unknown`) so ops/reconcile know.
- [x] Extend reconcile (on-read and/or job): for `submitted` **without** `txHash`, do not invent a hash — document ops path; for `submitted` **with** `txHash`, keep today’s capture path. Prefer proving spend via Klima `/certificate` when a hash is known (already). Optional later: chain/`AuthorizationUsed` lookup — only if certificate is insufficient; do not block C2 on full chain indexer.
- [x] Tests: mocked Klima timeout after “reserve → submitted” → row stays `submitted`, reserved unchanged, no `release` ledger row; mocked definitive Klima 4xx → `released` + release ledger; reconcile still settles when hash present.

### C3. Narrow the submitted-without-hash crash window

- [x] **Done when:** every real (and fake) retire attempt has a durable row in `submitted` **before** the outbound Klima call completes its side effect, and a process crash mid-call is distinguishable from “never called Klima”; reconcile/ops can tell “in flight / unknown” from “released”.

- [x] Already true today: status flips to `submitted` before `klimaRetire()`. Keep that order; do not move Klima before the CAS.
- [x] Persist a server-only **attempt marker** before calling Klima (same update as `submitted` or immediately after): e.g. `klima_attempt_at` timestamp and/or `klima_attempt_id` (UUID). Optional: store prepare-auth salt / auth nonce when available after prepare (real path) — only if it does not require an extra Klima round-trip before the C1 headroom claim.
- [x] On Klima success, keep writing `txHash` + auth spend **before** capture (current F2 order).
- [x] Document: `submitted` + null `txHash` + recent `klima_attempt_at` ⇒ ambiguous / crash; do not auto-release. Stale attempts (e.g. older than Cloud Run timeout + margin) stay reserved until ops or a later policy (manual release only with proof).
- [x] Tests: assert `submitted` + attempt marker exist before mocked Klima is invoked; success still persists hash then settles.

### C4. Structural uniqueness for ledger + tx hash

- [x] **Done when:** DB rejects a second `reserve`/`capture`/`release` for the same `retirement_id` + `type`, and rejects a second retirement row with the same non-null `tx_hash`; migrations named; existing data cleaned or verified unique first.

- [x] Migration (e.g. `--name add_retirement_concurrency_uniques`):
  - `UNIQUE (retirement_id, type)` on `ledger_entries` where `retirement_id IS NOT NULL` (partial unique index if funding rows keep null `retirement_id`).
  - Partial `UNIQUE (tx_hash)` on `retirements` where `tx_hash IS NOT NULL`.
- [x] Confirm orchestration still relies on CAS; constraints are belt-and-suspenders (duplicate capture txn must fail closed).
- [x] Tests: attempting a second capture for the same retirement fails at DB or domain layer; duplicate `tx_hash` insert/update rejected.

### C5. Shared retire rate limit (optional; headroom is C1)

- [x] **Done when:** either (a) multi-instance `POST /retirements` rate limits share state (Redis or similar), or (b) this item is deferred and the PR that closes C1 notes “N1 in-memory limits unchanged; wallet safety is C1 headroom”; if (a), over-limit still returns `429` with the frozen error shape.

- [x] **Deferred (b):** N1 in-memory limits unchanged; wallet safety is C1 headroom. Redis shared rate limits remain a later ops hardening item.
- [ ] If Redis (or equivalent) is introduced: move N1 retirement limiter store to shared backend; keep other routes in-memory unless cheap to share.
- [x] Do **not** re-implement wallet headroom here — that is C1.
- [x] Tests only if (a) is implemented — skipped under (b).

## Order of work (checklist)

- [x] 0. Phase 0 monorepo + backend health
- [x] B1–B4 skeleton, DB, auth, ledger
- [x] B5–B6 Klima reads + marked-up quotes
- [x] B7 evaluations
- [x] B7b evaluation quota + derived beneficiaryAddress
- [x] B7c persist OpenRouter evaluation costs (parallel OK; does not block API freeze)
- [x] B8–B9 retire + history (reset quota on settle)
- [ ] B10 Cloud Run + Neon + secrets (production Done when still open)
- [ ] S1 Staging API (Clerk/Stripe/Neon development + fake retire)
- [ ] S2 Expo web → staging API
- [ ] *Freeze API table*
- [x] M1 app shell
- [ ] M2–M3 auth (Clerk), evaluate (LLM)
- [ ] M4–M5 retire UX (classes) + certificate
- [ ] M6 EAS preview (staging API + web)
- [x] *Side:* T0–T1 endpoint test catch-up (parallel OK) — T0–T1 done
- [x] *Side:* N1 network throttling (parallel OK)
- [x] *Side:* F1 Stripe fee + FX on funding (parallel OK; does not block API freeze)
- [x] *Side:* F2 Klima auth/spend on retire (parallel OK; after or with F1)
- [x] *Side:* C4 retirement concurrency UNIQUEs (C1–C4 + C5 deferred done)
