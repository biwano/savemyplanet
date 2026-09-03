# Architecture

## Monorepo

Planned layout (not created yet):

```
apps/
  mobile/     # client: evaluate activities, fund, request retirement
  backend/    # API: accounts, quotes, retirement orchestration
packages/     # shared types / API contracts, when needed
```

Keep one repo. Shared types belong in `packages/` only after both apps exist and would otherwise duplicate them.

## Stack (chosen)

TypeScript end-to-end so the backend can use Klima’s x402 client (`@klimadao/x402-retire` / `klima-retire.ts`) and share request/response types with the app.

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | **pnpm workspaces + Turborepo** | Simple two-app repo, fast filtered scripts. |
| Mobile | **Expo (React Native) + TypeScript** | iOS and Android from one codebase. |
| Backend | **Hono + TypeScript** on Node | Small HTTP API for orchestration and LLM calls. |
| Auth / DB | **Supabase** | Integrated Auth (GoTrue) and PostgreSQL. Easier than manual setup. |
| ORM | **Drizzle** | TypeScript-first SQL access to the Supabase Postgres. |
| Signing | **viem** | Matches Klima examples for the x402 relay path. |
| Payments | **Stripe** | Fiat deposits via Apple/Google Pay. |
| AI | **OpenAI / Gemini API** | LLM for activity evaluation. |

Hono stays a thin API. Put markup, funding checks, and x402 orchestration in plain modules — not inside the framework.

Do not use Next.js as the mobile backend or Expo Router as an x402 proxy. The mobile app must keep talking only to `apps/backend`.

### Out

- Calling x402 from Expo / a WebView / a mobile wallet
- A separate “retire from the phone” crypto stack (RainbowKit, wagmi-on-device, etc.)

Chosen hosts: [hosting.md](hosting.md).

## System

```
mobile app  →  SaveMyPlanet backend  →  Klima x402 (https://x402.klimalabs.com/)
                    ↑
             funded user accounts
```

- **Mobile** is the only user-facing client. It talks only to our backend. It must not discover, quote, or retire via x402.
- **Backend** owns user accounts, balances, activity evaluation, **pricing (x402 cost + markup)**, and credit retirement.
- **Klima x402** is how the backend actually retires tokenized credits on Base. See [x402.md](x402.md). We buy at Klima’s price; the user is charged our marked-up price.

## Accounts and funding

Retirement spends the user’s SaveMyPlanet balance, not a user-held crypto wallet in the mobile app.

The backend must:

1. Quote Klima cost via x402 `/quote`, then apply **our markup**. That marked-up figure is the only price the mobile app sees and the amount the account must cover.
2. Refuse retirement if the account cannot cover the marked-up price.
3. Debit the account at the marked-up price only as part of a successful (or clearly in-flight) retirement, so a failed Klima call does not silently consume the balance.
4. Pay Klima from the service wallet at the (lower) x402 total. The difference is our margin.

How users deposit (fiat, crypto, etc.) is not decided yet. Until it is, treat “funded account” as an internal balance the backend checks before retiring.

## Evaluation vs retirement

Activity → tCO₂e evaluation is performed by an **LLM** on the backend. It takes natural language input from the user and returns a suggested tonnage. It does not hit x402.

Chosen tonnes → User selects a **Klima carbon class**; the backend performs a Klima quote, adds the **10% markup**, and executes on-chain retirement. x402 is backend-only.
