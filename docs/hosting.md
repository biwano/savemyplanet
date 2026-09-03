# Hosting (chosen)

Free tiers to develop and demo. They sleep, pause, or cap CPU. Store distribution, a funded service wallet, and production SLOs are the first things that outgrow this.

| Component | Host | Role |
| --- | --- | --- |
| API (`apps/backend`) | **Google Cloud Run** | Hono Node container, scale to zero, request timeout long enough to wait on Klima relay + certificate. Always-free monthly allowance (requests + vCPU/GiB-seconds). Needs a Google account (card often required). |
| Postgres | **Neon** | Serverless Postgres for Drizzle. Compute suspends when idle and wakes on the next query. ~0.5 GB storage, branching for previews. |
| Mobile (`apps/mobile`) | **Expo Go + EAS free** | Dev on Expo Go. EAS Build / EAS Update free quotas for internal binaries and JS updates. |
| Secrets / service wallet key | **Cloud Run secrets** | Never ship the Klima payer key in the Expo app or a public repo. |

Hono on Cloud Run: `@hono/node-server` in a small Node Docker image. Drizzle talks to Neon over the pooled or serverless driver. Keep the API synchronous on Cloud Run until retire is redesigned as async (`202` + poll).

## Why not the usual free APIs

- **Cloudflare Workers** — native Hono, but free CPU (~10 ms/request) cannot wait for Base confirmation.
- **Vercel Hobby** — Hono can run there and duration is now long enough, but Hobby is [non-commercial only](https://vercel.com/docs/limits/fair-use-guidelines). Charging a markup is commercial; Pro is not free.
- **Supabase** — fine Postgres, but the project pauses after ~7 days idle and needs a manual restore.

Optional later, not the API host: Cloudflare Pages for an Expo web preview; Cloudflare DNS if we have a domain (`*.run.app` works without it).

## Not free (plan for it)

- **Apple Developer** (~$99/year) and **Google Play** (~$25 once) to put the app on stores. Internal/dev builds via EAS do not need this.
- **USDC (or kVCM) on Base** in the backend service wallet. Hosting is free; retiring credits is not. Keep this balance off user devices.
- Production SLOs (no sleep, backups beyond Neon’s short restore window, a custom domain with SLA).

## Constraints

- The Expo app must use the Cloud Run HTTPS URL. No x402 from the client.
- Cloud Run must allow **outbound HTTPS** to `https://x402.klimalabs.com/`.
- Idle Neon + scale-to-zero Cloud Run means the first request after a pause can be slow; the mobile app should tolerate that on quotes, not hide a retirement in a 3s spinner.
