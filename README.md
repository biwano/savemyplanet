# ClearMyCarbon

A mobile app for retiring carbon credits, plus the backend that performs those retirements.

**Commercial name:** ClearMyCarbon. The git repo and some cloud resources may still use the legacy codename `savemyplanet`.

A person describes an activity, gets a suggested tCO₂e, funds a fiat balance, and retires credits against a Klima carbon class. They receive a public retirement certificate. The app never talks to Klima directly: the backend quotes, marks up, and retires so ClearMyCarbon can charge **40% over Klima’s cost**.

Retirement is irreversible. The app must confirm amount, marked-up cost, and certificate attribution before the backend executes.

## How it works

```
mobile app  →  ClearMyCarbon backend  →  Klima x402
                    ↑
             funded user accounts (Stripe)
```

- **Evaluate** an activity in natural language. An LLM on the backend suggests tonnes. No funded account required.
- **Fund** via Stripe (pay in USD or EUR; balance held in USD). No crypto deposits; no user-held wallets.
- **Retire** only when the balance covers the marked-up price. The backend pays Klima from a service wallet and returns a Carbonmark certificate.

## Repository

pnpm workspaces + Turborepo. TypeScript end to end.

```
apps/backend/     # Hono API: accounts, quotes, retirement orchestration
apps/mobile/      # Expo app (web staging on Cloudflare Workers; native Phase M)
packages/api-types/  # frozen HTTP wire types
docs/             # product, architecture, hosting, plan
```

Build **backend first**, freeze the API, then the Expo app. See [docs/plan.md](docs/plan.md).

| Layer | Choice |
| --- | --- |
| Mobile | Expo (React Native) + TypeScript |
| Backend | Hono + TypeScript on Node 22 |
| Auth | Clerk |
| DB | Neon Postgres + Drizzle |
| Payments | Stripe |
| Retirement | Klima x402 on Base (`@klimadao/x402-retire` / viem) |
| Hosting | Cloud Run, Neon, Clerk, Cloudflare Workers (Expo web staging), Expo EAS (native later) |

The mobile app must never call `https://x402.klimalabs.com/`. Wholesale Klima amounts never appear on user-facing APIs.

## Current state

Phase 0 and most of Phase B/S1 are in place (staging Cloud Run + fake retire). Phase S2 scaffolds `apps/mobile` and deploys Expo web to a Cloudflare Workers static-assets Worker on push to `staging`. See [docs/plan.md](docs/plan.md).

## Prerequisites

- Node 22+
- [pnpm](https://pnpm.io/) 9.7+
- A [Neon](https://neon.tech/) project (`DATABASE_URL`)
- A [Clerk](https://clerk.com/) application (needed once auth lands)

Copy [`.env.example`](.env.example) to `.env` and fill in secrets. For the Expo app, also copy [`apps/mobile/.env.example`](apps/mobile/.env.example) → `apps/mobile/.env`. Never commit private keys.

## Development

```bash
pnpm install
pnpm --filter backend dev    # http://localhost:3000/health
pnpm --filter mobile web     # Expo web (needs EXPO_PUBLIC_* in apps/mobile/.env)
```

Root scripts (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`) run through Turborepo once more packages exist.

Backend Docker image: `apps/backend/Dockerfile` (Cloud Run).
Expo web staging: [docs/hosting.md](docs/hosting.md) (Cloudflare Workers on push to `staging`).

## Docs

| File | What it covers |
| --- | --- |
| [docs/product.md](docs/product.md) | Goal, user flows, pricing, what is out of scope |
| [docs/architecture.md](docs/architecture.md) | Monorepo layout, stack, system boundaries |
| [docs/hosting.md](docs/hosting.md) | Cloud Run, Neon, Clerk, Cloudflare Workers, Expo EAS |
| [docs/plan.md](docs/plan.md) | Backend-then-mobile implementation plan and API contract |
| [docs/x402.md](docs/x402.md) | How the backend retires via Klima x402 |
| [AGENTS.md](AGENTS.md) | Working rules for contributors and agents |
