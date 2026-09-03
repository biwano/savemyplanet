# Hosting (chosen)

Free tiers to develop and demo. They sleep, pause, or cap CPU. Store distribution, a funded service wallet, and production SLOs are the first things that outgrow this.

| Component | Host | Role |
| --- | --- | --- |
| API (`apps/backend`) | **Google Cloud Run** | Hono Node container. Handles LLM calls, Stripe integration, and Klima x402 orchestration. |
| Auth / DB | **Supabase** | Integrated Auth and Postgres. **Constraint:** Free tier pauses after 7 days of inactivity (manual restore required). |
| Mobile (`apps/mobile`) | **Expo Go + EAS free** | Dev on Expo Go. EAS for internal builds. |
| Secrets / service wallet key | **Cloud Run secrets** | Secure storage for Klima keys, Supabase credentials, and Stripe keys. |

Hono on Cloud Run connects to Supabase Postgres via the Drizzle driver. Keep the API synchronous until timeouts force an async redesign.

## Why not the usual free APIs

- **Neon** — Excellent scale-to-zero (no manual restore), but lacks the integrated Auth that makes Supabase "easier" for this MVP.
- **Vercel Hobby** — [Non-commercial only](https://vercel.com/docs/limits/fair-use-guidelines). Since this app takes a markup, it is commercial.

Optional later, not the API host: Cloudflare Pages for an Expo web preview; Cloudflare DNS if we have a domain (`*.run.app` works without it).

## Not free (plan for it)

- **Apple Developer** (~$99/year) and **Google Play** (~$25 once) to put the app on stores. Internal/dev builds via EAS do not need this.
- **USDC (or kVCM) on Base** in the backend service wallet. Hosting is free; retiring credits is not. Keep this balance off user devices.
- Production SLOs (no sleep, backups beyond Neon’s short restore window, a custom domain with SLA).

## Constraints

- The Expo app must use the Cloud Run HTTPS URL. No x402 from the client.
- Cloud Run must allow **outbound HTTPS** to `https://x402.klimalabs.com/`.
- Idle Supabase + scale-to-zero Cloud Run means the first request after a pause can be slow. The mobile app should show a loading state that handles a ~5-10s cold start.
