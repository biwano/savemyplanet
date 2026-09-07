# ClearMyCarbon

This repository is a **monorepo** for **ClearMyCarbon** — a mobile app that lets people clear their carbon footprint (by retiring carbon credits), plus the backend that performs those retirements. (Repo/infra paths may still say `savemyplanet`; that is a legacy codename, not the product name.)

Read this file first. Detailed notes live in the files below — keep them in sync when product or architecture changes.

## Read these

| File | What it covers |
| --- | --- |
| [docs/product.md](docs/product.md) | Product goal, user flows, and account funding |
| [docs/ux.md](docs/ux.md) | **Law for mobile UI** — screens, copy, interactions, and flows |
| [docs/architecture.md](docs/architecture.md) | Monorepo layout, chosen stack, and system boundaries |
| [docs/hosting.md](docs/hosting.md) | Chosen hosts: Cloud Run, Neon, Clerk, Expo EAS (Europe); staging vs production |
| [docs/plan.md](docs/plan.md) | Implementation plan: backend → staging → API freeze → mobile |

## Current state

The product and architecture are specified in `docs/`. Phase 0 (monorepo + health + Neon) is done. Stack and hosting are **chosen**. Follow [docs/plan.md](docs/plan.md): backend through staging (fake retire + Expo web) and API freeze, then mobile. Do not invent extra apps, services, or crypto-wallet UX unless those docs are updated first.

## Working rules

- **[docs/ux.md](docs/ux.md) is law for mobile screens and flows.** Implement Phase M against it. If [docs/plan.md](docs/plan.md) (or existing app code) disagrees on UI content, interactions, copy, or navigation, **follow ux.md** — then update the plan/code to match. Do not preserve a mismatched screen “because it’s already there.”
- The **mobile app never retires** and never calls `https://x402.klimalabs.com/`. The backend retires so we can charge a **markup** over Klima cost.
- Retirement is **irreversible** (app copy: **clear**). Confirm amount, cost, and attribution before executing.
- A user can **evaluate** an activity’s tCO₂e without funding. They can **clear** (retire) only if their account is funded.
- Prefer updating the docs in the table above over duplicating product decisions in this file.
- When a phase’s **Done when** in [docs/plan.md](docs/plan.md) is met, check it `[x]` there (and the matching bullets / order-of-work row). Do not mark a phase done because related files exist.
- Relative TypeScript imports are **extensionless** (e.g. `./db/index`, not `./db/index.ts`). Matches `moduleResolution: "bundler"` and the rest of `apps/backend`.
- When generating Drizzle migrations, always pass a descriptive `--name` (e.g. `npm run db:generate -- --name add_ledger_indexes`) so files are not random tags like `0001_naive_joshua_kane`.
- Required env vars: use `requireEnv('NAME')` from `apps/backend/src/config.ts` (trims; throws `NAME is not set`). Do not hand-roll `process.env` + throw. Optional vars stay as direct `process.env` reads (or a typed optional helper).
- Do not widen `as const` arrays with casts like `as readonly string[]` / `as string[]` to appease `.includes(value: string)`. That erases the literal union. Prefer `.some((x) => x === value)`, or a small typed helper that preserves the element type.
- Lint with ESLint (`pnpm lint`). Do not leave `lint` scripts as stubs that call missing binaries.
- Types that mirror the **HTTP/API contract** (frozen field names in [docs/plan.md](docs/plan.md)) use an `API` prefix (e.g. `APIAccountBalance`). Domain/DB types keep plain names (`availableCents`, Drizzle `$inferSelect`, etc.). Helpers that map DB → wire belong next to the `API*` type.
- Backend HTTP routes: **one file per route** under `apps/backend/src/routes/`, with directories mirroring the URL path. Mount each file at that path in `app.ts` (handlers use `/` on the sub-app). Examples: `GET /me` → `routes/me.ts`; `POST /account/deposit` → `routes/account/deposit.ts`. When a path segment is both a route and a prefix, use `index.ts` for the segment itself (`GET /account` → `routes/account/index.ts`).
- Write tests for **each** HTTP endpoint (success and important failure cases). Colocate them with the route (e.g. `routes/me.test.ts` next to `routes/me.ts`); do not ship a new route without coverage. Catch-up for existing routes: [docs/plan.md](docs/plan.md#side-plan--endpoint-tests-catch-up).
- Route tests that **mutate** durable state (ledger credits, quotes, user sync, retirements): assert the **HTTP body and a DB re-read**. Response-only checks miss regressions that return the right JSON without persisting (or that update balances without a matching ledger row). Read-only / validation / auth failures do not need a DB assert.
- Integration tests share a real DB (`DATABASE_URL` / CI staging). Make them **concurrency-proof across CI jobs and local runs**: never use fixed `clerkId`, Stripe PaymentIntent ids, or other unique keys that another process might insert or delete. Prefer `randomUUID()` (or `createTestUser()`) per test; clean up only what that test created.
- Backend Vitest setup uses **MSW** to fail closed on unexpected outbound HTTP (allow Neon/DB only). Stub Stripe / Klima / OpenRouter / Clerk via the helpers in `apps/backend/src/test/mocks.ts` (and auth helpers); do not rely on real provider network in tests.
- `clerkId` / Clerk `user_…` ids are **internal only** (auth middleware, webhooks, DB sync). HTTP request and response bodies never accept or return them — public identity is our `users.id` UUID.
- Mobile brand images under `apps/mobile/assets/images/`: do **not** ship the same 1024×1024 master as favicon/logo/splash. Target sizes: `icon.png` / `android-icon-foreground.png` → 1024; `splash-icon.png` → 512; in-app `logo.png` → 256; `favicon.png` → 48. Resize/recompress with **sharp** ad hoc (not a repo dependency) — e.g. `mkdir -p /tmp/imgtool && cd /tmp/imgtool && npm i sharp` then `sharp(src).resize(N, N).png({ compressionLevel: 9 }).toFile(out)`.
