# Product

SaveMyPlanet helps people retire carbon credits from a mobile app.

## Goal

A person opens the app, optionally asks it to estimate the carbon tonnage of an activity, funds their account if needed, and retires that amount of credits. They get a public retirement certificate.

## Users can

1. **Evaluate an activity** — users describe an activity (e.g., "I flew from Paris to NYC") in natural language. An **LLM** extracts or estimates the tCO₂e. This is a suggestion; the user confirms the final amount.
2. **Fund an account** — users deposit fiat (USD/EUR) via **Stripe** to hold a balance. Retirement is blocked until the balance covers the marked-up cost. **No crypto deposits.**
3. **Retire credits** — users choose a **Klima carbon class** (e.g., Biochar, Forest conservation) and confirm the tonnage. The backend executes the retirement via x402 and returns a certificate.

Evaluation does not require a funded account. Retirement does.

## Pricing

Users pay SaveMyPlanet, not Klima. The price shown in the app is Klima’s retirement cost **plus our markup**. That is why retirement is never direct from the mobile app: if the client called x402, we could not take a margin.

The funded account is debited at the marked-up price. The markup is fixed at **10%** (1000 basis points). The app never surfaces the raw x402 wholesale quote.

## Retirement is permanent

Once credits are retired they cannot be un-retired. The certificate attribution (beneficiary, message) is also permanent. The app must show amount, estimated cost (marked-up), and certificate details and get an explicit confirm before the backend retires.

## Out of scope for now

- Direct retirement from the mobile app (no x402 from the client; we capture markup on the backend)
- Letting users pick arbitrary on-chain wallets as the retiring payer (the backend owns settlement; see [architecture.md](architecture.md))
