# Product

SaveMyPlanet helps people retire carbon credits from a mobile app.

## Goal

A person opens the app, optionally asks it to estimate the carbon tonnage of an activity, funds their account if needed, and retires that amount of credits. They get a public retirement certificate.

## Users can

1. **Evaluate an activity** — describe something they did (or will do) and get a suggested tCO₂e amount. The estimate is a decision aid; the user chooses the retirement quantity.
2. **Fund an account** — hold a balance in SaveMyPlanet. Retirement is blocked until the account can cover the quoted cost.
3. **Retire credits** — confirm amount and **our** price; the backend retires on-chain via Klima x402 and returns a certificate.

Evaluation does not require a funded account. Retirement does.

## Pricing

Users pay SaveMyPlanet, not Klima. The price shown in the app is Klima’s retirement cost **plus our markup**. That is why retirement is never direct from the mobile app: if the client called x402, we could not take a margin.

The funded account is debited at the marked-up price. The markup rate is not decided yet; until it is, treat it as a backend-owned number and never surface the raw x402 quote as what the user pays.

## Retirement is permanent

Once credits are retired they cannot be un-retired. The certificate attribution (beneficiary, message) is also permanent. The app must show amount, estimated cost (marked-up), and certificate details and get an explicit confirm before the backend retires.

## Out of scope for now

- Direct retirement from the mobile app (no x402 from the client; we capture markup on the backend)
- Letting users pick arbitrary on-chain wallets as the retiring payer (the backend owns settlement; see [architecture.md](architecture.md))
