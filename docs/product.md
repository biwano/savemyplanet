# Product

SaveMyPlanet helps people retire carbon credits from a mobile app.

## Goal

A person opens the app, optionally asks it to estimate the carbon tonnage of an activity, funds their account if needed, and retires that amount of credits. They get a public retirement certificate.

## Users can

1. **Evaluate an activity** — users describe an activity (e.g., "I flew from Paris to NYC") in natural language. An **LLM** extracts or estimates the tCO₂e. This is a suggestion; the user confirms the final amount.

   **Evaluation quota:** each user starts with **10** evaluations. Every successful evaluation decrements the remaining count by one. At **zero**, `POST /evaluations` is refused until the quota is restored. A successful **retirement** resets remaining evaluations to **10**. Evaluation does not require a funded account; it does require remaining quota (and auth).
2. **Fund an account** — users deposit fiat via **Stripe** (pay in **USD or EUR**). The account balance is always held in **USD**. An EUR payment is converted once at funding and credited in USD cents. Retirement is blocked until that balance covers the marked-up cost. **No crypto deposits.**

   **Minimum deposit:** **$5.00** or **€5.00** (500 minor units). Keeps Stripe’s fixed per-charge fee small relative to the balance so the 40% retirement markup can cover processing costs. (Stripe’s own card floor is lower; we enforce the product minimum.)
3. **Retire credits** — users choose a **Klima carbon class** (e.g., Biochar, Forest conservation) and confirm the tonnage. The backend executes the retirement via x402 and returns a certificate.

   **Default beneficiary address:** the backend derives a stable on-chain `beneficiaryAddress` from the user’s UUID and uses it by default when retiring (certificate attribution). Users do not supply or manage wallets for this.

Evaluation does not require a funded account. Retirement does.

## Pricing

Users pay SaveMyPlanet, not Klima. The price shown in the app is Klima’s retirement cost **plus our markup**. That is why retirement is never direct from the mobile app: if the client called x402, we could not take a margin.

The funded account is debited at the marked-up price. The markup is fixed at **40%** (4000 basis points). The app never surfaces the raw x402 wholesale quote.

**Stripe fees:** deposits credit **gross** — pay $10 → $10 available (EUR converted once to USD cents). Processing fees come out of our Stripe settlement, not the user’s balance. We recover them via the retirement markup (no deposit surcharge, no net-of-fees credit). Size `MARKUP_BPS` so it covers Klima cost + expected card/FX fees + margin.

## Retirement is permanent

Once credits are retired they cannot be un-retired. The certificate attribution (beneficiary, message) is also permanent. The app must show amount, estimated cost (marked-up), and certificate details and get an explicit confirm before the backend retires.

## Out of scope for now

- Direct retirement from the mobile app (no x402 from the client; we capture markup on the backend)
- Letting users pick arbitrary on-chain wallets as the retiring payer (the backend owns settlement; see [architecture.md](architecture.md))
