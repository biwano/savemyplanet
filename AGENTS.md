# SaveMyPlanet

This repository is a **monorepo** for a mobile app that lets people retire carbon credits, plus the backend that performs those retirements.

Read this file first. Detailed notes live in the files below — keep them in sync when product or architecture changes.

## Read these

| File | What it covers |
| --- | --- |
| [docs/product.md](docs/product.md) | Product goal, user flows, and account funding |
| [docs/architecture.md](docs/architecture.md) | Monorepo layout, chosen stack, and system boundaries |
| [docs/hosting.md](docs/hosting.md) | Chosen hosts: Cloud Run, Neon, Clerk, Expo EAS (Europe) |
| [docs/plan.md](docs/plan.md) | Implementation plan: backend first, then mobile |

## Current state

The product and architecture are specified in `docs/`. Phase 0 (monorepo + health + Neon) is done. Stack and hosting are **chosen**. Follow [docs/plan.md](docs/plan.md): backend through API freeze, then mobile. Do not invent extra apps, services, or crypto-wallet UX unless those docs are updated first.

## Working rules

- The **mobile app never retires** and never calls `https://x402.klimalabs.com/`. The backend retires so we can charge a **markup** over Klima cost.
- Retirement is **irreversible**. Confirm amount, cost, and attribution before executing.
- A user can **evaluate** an activity’s tCO₂e without funding. They can **retire** only if their account is funded.
- Prefer updating the docs in the table above over duplicating product decisions in this file.
- When a phase’s **Done when** in [docs/plan.md](docs/plan.md) is met, check it `[x]` there (and the matching bullets / order-of-work row). Do not mark a phase done because related files exist.
- Relative TypeScript imports are **extensionless** (e.g. `./db/index`, not `./db/index.ts`). Matches `moduleResolution: "bundler"` and the rest of `apps/backend`.
