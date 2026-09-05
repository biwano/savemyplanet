# Implementation plan

Build **backend first**, then the Expo app against a frozen API. Do not start `apps/mobile` until Phase B is shippable on Cloud Run (or equivalent local Docker) and the contract in [API contract](#api-contract-freeze-before-mobile) is stable.

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
| `users` | id, clerk_id (unique), email, available_cents, reserved_cents (integer USD cents), created_at |
| `ledger_entries` | immutable credits/debits: funding, reserve, capture, release; includes `retirement_id` |
| `quotes` | snapshot of user-facing price (tonnes, markup_bps, user_total, klima_total stored **server-only**, expiry) |
| `retirements` | state machine + certificate URL, tx hash, tonnes, attribution |
| `evaluations` | optional audit of activity text → suggested tonnes |

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

1. Validate tonnes (≥ 0.001; Puro whole-tonne rules if the selected credit requires it).
2. Backend picks carbon class (discover + cap).
3. x402 `/quote` → `klima_total`.
4. `user_total = klima_total * (1 + MARKUP_BPS / 10000)` (document rounding: round **up** in the user’s favor to cents so we never under-charge).
5. Persist quote with short TTL (e.g. 10 minutes). Return **only** user-facing fields: tonnes, `user_total`, currency (`USD`), expires_at, quote_id. No `klima_total`, no `humanSummary` from Klima.

- [x] `POST /quotes` (auth): validate tonnes; discover + optional price cap / optional `carbonClass`; Klima wholesale + markup (ceil to cents); persist with TTL; return `{ quoteId, carbonClass, tonnes, userTotal, currency, expiresAt }` only.

### B7. Evaluate activity (LLM)

- [x] **Done when:** natural language "I drove 100km" returns a valid tonnage.

`POST /evaluations` `{ activity: string }` → `{ suggestedTonnes, rationale }`.

- [x] Backend calls LLM (OpenRouter) with a system prompt to extract tonnage from activity text.
- [x] No heuristic estimate: if the LLM fails or is ambiguous, return an error (no invented tonnage).

### B8. Retire (orchestration)

- [ ] **Done when:** (testnet or tiny mainnet amount) funded user retires; balance drops by **user_total**; certificate URL stored; a forced Klima failure refunds the reserve.

`POST /retirements` `{ quote_id, beneficiaryString, retirementMessage?, confirm: true }`

Require `confirm: true`. Without it, 400.

State machine:

```
quoted → reserved → submitted → settled
                 ↘ released (Klima failed / expired quote)
```

1. Load quote; 400 if expired or already used.
2. If `available < user_total` → `402`/`409` insufficient_funds.
3. **Reserve** `user_total` (available ↓, reserved ↑, ledger `reserve`).
4. Sign + relay via Klima (`retire()` / prepare-auth → actions/retire) from the **service wallet**.
5. On Klima success: ledger `capture`, store tx hash + certificate.
6. On Klima failure: ledger `release`, reserved ↓, available ↑. User is not charged.

Dry-run / test retirements use a **staging environment** (Stripe test keys + Neon branch), not a staged flag in production.

Service wallet: `KLIMA_PAYER_PRIVATE_KEY` only on the server. USDC on Base; no ETH required for relay.

Timeouts: Cloud Run request timeout ≥ Klima wait (start at 60s, raise if needed). If we still hit limits, only then split into `202` + `GET /retirements/:id` polling — that is an explicit follow-up, not v1.

### B9. Retirement history

- [ ] **Done when:** settled row matches Carbonmark URL from x402.

- [ ] `GET /retirements` list for the user.
- [ ] `GET /retirements/:id` status + certificate URL when settled.

### B10. Deploy backend

- [ ] **Done when:** register → credit (admin) → quote → retire works against the deployed API with a funded service wallet. Record the public base URL for mobile.

- [ ] Neon project in AWS `eu-central-1` (Frankfurt) + migrate.
- [ ] Cloud Run in `europe-west1` (Belgium) or `europe-west9` (Paris): image from `apps/backend/Dockerfile`, secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET`, `KLIMA_PAYER_PRIVATE_KEY`).
- [ ] Outbound HTTPS to `x402.klimalabs.com` and OpenRouter allowed.
- [ ] `GET /health` on the `*.run.app` URL.

---

## API contract (freeze before mobile)

User-facing JSON. Field names are the freeze; change only with a version bump.

| Method | Path | Auth | Success |
| --- | --- | --- | --- |
| GET | `/health` | no | `{ ok: true }` |
| POST | `/auth/register` | no | handled by Clerk UI |
| POST | `/auth/login` | no | handled by Clerk UI |
| GET | `/me` | yes | `{ user, account }` |
| GET | `/account` | yes | `{ available, reserved, currency }` |
| POST | `/account/deposit` | yes | `{ clientSecret, paymentIntentId }` (presentment `usd` \| `eur`) |
| POST | `/account/credit` | admin | `{ account }` (v1 funding) |
| POST | `/evaluations` | yes | `{ suggestedTonnes, rationale }` |
| GET | `/classes` | yes | `{ classes: [...] }` (list Klima classes) |
| POST | `/quotes` | yes | `{ quoteId, carbonClass, tonnes, userTotal, currency, expiresAt }` |
| POST | `/retirements` | yes | `{ id, status, certificateUrl? }` |
| GET | `/retirements` | yes | `{ items: [...] }` |
| GET | `/retirements/:id` | yes | `{ id, status, tonnes, userTotal, certificateUrl?, txHash? }` |

`account.available` / quote `userTotal` are **marked-up**. Wholesale Klima amounts never appear.

After B10, treat this table as the mobile source of truth. Put shared types in `packages/api-types` only when the Expo app exists and would otherwise copy them.

---

## Phase M — Mobile

Expo app talks **only** to the Cloud Run base URL (config: `EXPO_PUBLIC_API_URL`). No Klima URLs, no private keys, no wholesale prices.

### M1. App shell

- [ ] **Done when:** Expo Go hits deployed `/health`.

- [ ] Expo + TypeScript, Expo Router.
- [ ] Auth storage (secure store) for JWT (managed by Clerk).
- [ ] API client typed from the frozen contract.
- [ ] Tolerate Cloud Run/Neon cold start on first request (retry/spinner, not a 3s hard fail).

### M2. Auth and account

- [ ] **Done when:** a user can sign in and see balance after an admin credit.

- [ ] register, login, logout via Clerk Expo SDK.
- [ ] Home: available balance, reserved if any.
- [ ] Deposit: Stripe payment sheet.

### M3. Evaluate

- [ ] **Done when:** suggestion appears without a funded account (auth still required if the API requires it; if we want evaluate logged-out, add that to the contract **before** this screen).

- [ ] Text field for the activity.
- [ ] Show `suggestedTonnes` + rationale.
- [ ] Prefill the retirement amount; user can edit.

Default: evaluation requires auth (simpler). Logged-out evaluate is a later contract change.

### M4. Quote and confirm retire

- [ ] **Done when:** confirm retires and the UI does not show Klima’s total.

- [ ] Browse `/classes` and select one.
- [ ] Request `/quotes` for the chosen tonnes + class.
- [ ] Show **our** price (marked-up), tonnes, beneficiary name.
- [ ] Explicit Confirm control (maps to `confirm: true`).
- [ ] Errors: insufficient funds → prompt to deposit (Stripe).

### M5. Certificate

- [ ] **Done when:** history shows a settled item with a working certificate link.

- [ ] Status for in-flight retirements.
- [ ] Open/share Carbonmark `certificateUrl` when settled.
- [ ] History list from `GET /retirements`.

### M6. EAS

- [ ] **Done when:** a preview APK/IPA (or Expo Go project) runs the full flow: evaluate → quote → confirm → certificate.

- [ ] `eas.json` development + preview profiles.
- [ ] Point preview builds at the Cloud Run URL.
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

## Order of work (checklist)

- [x] 0. Phase 0 monorepo + backend health
- [x] B1–B4 skeleton, DB, auth, ledger
- [x] B5–B6 Klima reads + marked-up quotes
- [x] B7 evaluations
- [ ] B8–B9 retire + history
- [ ] B10 Cloud Run + Neon + secrets
- [ ] *Freeze API table*
- [ ] M1–M3 shell, auth (Clerk), evaluate (LLM)
- [ ] M4–M5 retire UX (classes) + certificate
- [ ] M6 EAS preview
- [x] *Side:* T0–T1 endpoint test catch-up (parallel OK) — T0–T1 done
