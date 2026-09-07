# UX

Mobile UX for **ClearMyCarbon**. Product rules: [product.md](product.md). API surface: [plan.md](plan.md#api-contract-freeze-before-mobile). This document is the screen and flow source of truth for Phase M — implement against it, not against any earlier prototype.

## Principles

1. **One primary job.** Open the app → optionally estimate an activity → fund if needed → clear → leave with a certificate. Everything else supports that loop.
2. **Evaluate freely, clear carefully.** Estimation is cheap and reversible in spirit (a suggestion). Clearing is permanent: show amount, marked-up cost, and certificate attribution, then require an explicit confirm.
3. **No crypto theater.** Users never see wallets, chain IDs, wholesale Klima prices, or x402. Balance is fiat (USD). The certificate is the proof.
4. **Suggestion, not decree.** The LLM estimate is editable. The user owns the final tonnage.
5. **Fund only when it matters.** Evaluation works with a zero balance. Prompt to deposit at the moment clearing would fail, not before.
6. **Quota motivates without nagging.** Show remaining evaluations on the Evaluate flow. At zero, the path forward is clear (which resets to 10), not “buy more evaluations.”

## Information architecture

```
Signed out
  └─ Welcome / Sign-in

Signed in (tab shell)
  ├─ Home
  ├─ History
  └─ Account
        └─ Deposit (modal / stack)

Flows (pushed stacks, not tabs)
  ├─ Evaluate → result → handoff into Clear
  └─ Clear: amount → class → confirm → progress → certificate
```

Tabs stay at three. Evaluate and Clear are **flows** launched from Home (or History empty states), not permanent tabs — they have a clear start and end.

---

## Screens

### 1. Welcome / Sign-in

**Purpose.** Brand + authenticate. First impression for signed-out users.

**Content**

- Product name: ClearMyCarbon (hero-level, not a nav eyebrow).
- Tagline: **Make peace with your footprint.**
- Primary CTA: Continue / Sign in (Clerk).
- Secondary: Create account (same Clerk flow if separate).

**Interactions**

- Tap sign-in / sign-up → Clerk UI (email, Apple, Google — whatever Clerk is configured for).
- Success → land on **Home**.
- No browse-as-guest. Auth is required (matches API: evaluate and account need a session).

**Not on this screen**

- Balance, classes, sample certificates, feature grids, or “how it works” carousels.

---

### 2. Home

**Purpose.** Status at a glance and the two entry points: estimate an activity, or clear a known amount.

**Content**

- Greeting / product name (light).
- **Available balance** (USD).
- Primary CTA: **Estimate an activity** (evaluate flow).
- Secondary CTA: **Clear carbon** (clear flow with empty amount — user types tonnes).
- If there is at least one settled clearing: a compact “Latest certificate” row (tonnes + open link). If `certificateUrl` is present, tap opens it; otherwise → **Clearing detail**.
- If balance is $0 and user has never deposited: one short line under balance — “Add funds when you’re ready to clear” (not a blocking wall).

**Interactions**

- Tap Estimate → **Evaluate**.
- Tap Clear → **Clear · Amount** (tonnes blank or last-used default none).
- Tap Latest certificate → open `certificateUrl` when present; otherwise **Clearing detail**.
- Pull to refresh → `GET /me` (balance).
- When evaluations remaining is **0**: Estimate CTA still opens **Evaluate**, which shows **Quota empty** (do not show the count on Home).

**Empty / first-run**

- Same layout. No fake stats. CTAs still work.

---

### 3. Evaluate

**Purpose.** Turn a natural-language activity into a suggested tonnage. Does not require a funded balance. Consumes one evaluation only on success.

**Content**

- Title: Estimate carbon emissions.
- Remaining count: “N evaluations left”.
- Multiline text field: activity description. Placeholder examples rotate lightly (e.g. “I flew Paris → New York round trip”, “Drove 400 km this month”).
- Formulation help (above or below the field): Include concrete metrics when you can — distance or route, duration, number of people, vehicle or cabin class, frequency (e.g. “2 people, Paris → NYC economy round trip”, “drove 400 km alone in a petrol car”). More detail → better estimate.
- Primary: **Estimate**.
- Helper: estimates are approximate; you’ll confirm the final amount before clearing.

**Interactions**

- Submit with non-empty text → loading (tolerate cold start) → **Evaluate result** on success.
- Ambiguous / failed LLM → inline error; quota **unchanged**; stay on this screen.
- Quota already 0 → do not call API; show **Quota empty**.
- Back → Home.

**Not here**

- Class picker, price, deposit, or auto-clear.

---

### 4. Evaluate result

**Purpose.** Show the suggestion; let the user accept or edit before entering clear.

**Content**

- Suggested tonnes (prominent).
- Short rationale from the API (readable, not raw model dump).
- Editable tonnes field (pre-filled with `suggestedTonnes`).
- Updated “N evaluations left” from the response.
- Primary: **Continue to clear**.
- Secondary: **Estimate something else** (back to Evaluate, fresh field).
- Tertiary: Done / close → Home (keep the suggestion only if we stash it in session for Clear; otherwise discard).

**Interactions**

- Edit tonnes → Continue uses the edited value (client validation: ≥ 0.001).
- Continue → **Clear · Amount** with tonnes prefilled (skip re-entry), then class; also carry the original activity text into Confirm as a prefilled **message** (`retirementMessage`) — user can edit or clear it.
- Prefer stacking: Result → Class (amount already set) to shorten the path. If amount must be revisited, insert Amount as an editable step with prefill.

**Recommended path after result:** Result (edit OK) → **Class** → **Confirm** (amount + message carried forward).

---

### 5. Quota empty

**Purpose.** Block more estimates without dead-ending the product.

**Content**

- Title / message: **Quota empty.**
- Explanation: Please clear carbon to reset the quota.
- Primary: **Clear carbon**.
- Secondary: Back to Home.

**Interactions**

- Clear → Clear · Amount.
- No “purchase more evaluations” affordance.

---

### 6. Clear · Amount

**Purpose.** Choose how many tonnes to clear when the user did not come from Evaluate, or wants to change the carried amount.

**Content**

- Title: How much to clear?
- Tonnes input (decimal). Hint: minimum 0.001 tCO₂e.
- Optional: “Not sure?” link → Evaluate.
- Primary: **Next**.
- Balance reminder only if useful: available USD (not a hard gate yet — gate at confirm).

**Interactions**

- Valid tonnes → **Class**.
- Invalid → inline validation.
- Back → previous (Home or Evaluate result).

Skip this screen when arriving from Evaluate result with a confirmed amount (still allow edit on Confirm).

---

### 7. Clear · Class

**Purpose.** Pick a Klima carbon class (e.g. Biochar, Forest conservation). Users pick a class, not a specific on-chain token. List is already filtered to classes that accept fractional tonnes ([product.md](product.md)) — no whole-tonne rounding UI.

**Content**

- Title: Choose a project type.
- List from `GET /classes`: name + short description if the API provides one.
- Selected state on one row.
- Primary: **Continue** (enabled when a class is selected).
- Secondary: **I don’t know** — always enabled; picks the cheapest eligible class for the current tonnes and advances immediately (no need to select a row first).
- Tonnes summary chip: “Clearing X tCO₂e”.

**Interactions**

- Select class → Continue → request quote → **Confirm** (or show quote loading on Confirm).
- **I don’t know** → choose the cheapest allowed class for these tonnes (prefer `POST /quotes` without `carbonClass` so the backend auto-picks; otherwise equivalent client-side pick) → **Confirm**. Show the chosen class name on Confirm once the quote returns.
- Back → Amount or Evaluate result.

**Not here**

- Live wholesale prices, token IDs, or chain details.

---

### 8. Clear · Confirm

**Purpose.** Last reversible step. Make permanence and cost unmistakable.

**Content**

- Headline: Confirm clearing.
- Summary block:
  - Tonnes
  - Carbon class
  - **Price you pay** (`userTotal`, USD) — marked-up only
  - Quote expiry (if close: “Price holds until …”)
- Attribution:
  - **Name on certificate** (`beneficiaryString`) — text field, required. Prefill with Clerk first + last name when set, else email local-part; user can edit.
  - Optional **message** (`retirementMessage`). When arriving from Evaluate, prefill with the activity text the user submitted; otherwise empty. Editable.
  - No wallet field. Do not show `beneficiaryAddress` unless we later add an advanced “technical details” disclosure; default is hide.
- Balance line: Available $X · After clearing $Y (or “Need $Z more”).
- Warning: Clearing cannot be undone. The certificate attribution is permanent.
- Primary: **Confirm and clear** (destructive-weight styling, not casual).
- Secondary: Cancel / Back.

**Interactions**

- On appear (or on Continue from Class): `POST /quotes` with tonnes + class. Show spinner until quote returns. If quote fails, error + retry.
- If `available < userTotal`: primary becomes **Add funds to continue** → **Deposit** with suggested amount = **max(shortfall, $5 / €5 minimum)** for the chosen presentment currency. After successful deposit, **return to this Confirm screen** with fields still prefilled; refresh quote/balance.
- If quote expired before confirm: refresh quote automatically once, or prompt to refresh; never clear on a stale id.
- Confirm → disable button → **Clear · Progress** (`POST /retirements`).
- Insufficient funds error from API → same deposit handoff.
- Cancel → Home (discard quote).

**Never show**

- Klima wholesale total, markup percentage as a “fee line item,” or service wallet info.

---

### 9. Clear · Progress

**Purpose.** Cover the irreversible in-flight wait (backend may take tens of seconds).

**Content**

- Calm status: “Clearing your carbon…”
- Short reassurance: do not close the app; this can take a minute.
- No fake progress bar that hits 100% early. Indeterminate spinner is fine.
- If status becomes `pending_index`: “Submitted — certificate is being prepared.”

**Interactions**

- On success (`settled` or `pending_index` with id): navigate to **Certificate** (or detail).
- On definitive failure / released: error screen with “You were not charged” + Back to Home / Try again.
- On ambiguous / timeout with reserved funds: “We’re confirming your clearing” → link to **Clearing detail** / History (do not claim failure or success).
- Back gesture disabled or confirms “check History if you leave.”

---

### 10. Certificate (success)

**Purpose.** Emotional payoff and shareable proof.

**Content**

- Success title: Carbon cleared.
- Tonnes + class + amount paid (user total).
- Name on certificate / message as submitted.
- Primary: **View certificate** (open `certificateUrl` in browser / in-app browser).
- Secondary: **Share** (system share sheet with certificate URL when available).
- If `pending_index` and no URL yet: “Certificate link will appear in History shortly” + Done.
- Tertiary: **Done** → Home.
- Quiet note: evaluations restored to 10 (refresh `/me`).

**Interactions**

- View / Share as above.
- Done → Home (balance and quota updated).

---

### 11. History

**Purpose.** List past and in-flight clearings (`GET /retirements`).

**Content**

- Title: Certificates / History.
- Rows: date, tonnes, class (if available), status badge (`settled`, `pending_index`, `submitted`, `released`), amount (user total).
- Rows with a certificate may show a subtle link/affordance; tap still follows the rule below.
- Empty: “Nothing cleared yet” + CTA Estimate or Clear.

**Interactions**

- Tap row: if `certificateUrl` is present → open it (browser / in-app browser). Otherwise → **Clearing detail**.
- Pull to refresh → `GET /retirements`.
- Tab always available when signed in.

---

### 12. Clearing detail

**Purpose.** Status truth for one clearing; open certificate when ready. Maps to `GET /retirements/:id`.

**Content**

- Status (human copy per state — prefer “clearing” / “cleared” over “retirement” in UI strings).
- Tonnes, class, user total, created time.
- Certificate button when `certificateUrl` present.
- Tx hash: omit in v1 UI (or tuck under “Technical details”) — not needed for the product story.
- Attribution: beneficiary string / message.

**Interactions**

- View certificate → external URL.
- While `submitted` / `pending_index`: pull to refresh / periodic refetch of `GET /retirements/:id`.
- Back → History.

---

### 13. Account

**Purpose.** Balance, profile name, funding entry, session.

**Content**

- Available balance (USD).
- **First name** and **last name** fields (from Clerk profile); editable.
- Primary: **Add funds**.
- Sign out.

**Interactions**

- Edit first/last name → save via Clerk user profile update; success refreshes local profile. Prefill on Clear · Confirm (`beneficiaryString`) should use the updated name on next visit.
- Add funds → **Deposit**.
- Sign out → Clerk sign-out → Welcome.
- No display of Clerk `user_…` ids; our user UUID only if needed for support (prefer hide).

---

### 14. Deposit

**Purpose.** Fund the USD balance via Stripe. Minimum $5 or €5.

**Content**

- Title: Add funds.
- Amount field (major units).
- Currency toggle: USD | EUR (presentment only; balance remains USD).
- Minimum hint: at least $5.00 or €5.00.
- When opened from insufficient funds: prefill suggested amount as **max(shortfall, minimum)** — never below **$5.00** / **€5.00** (match the selected presentment currency). Show “Needed for this clearing: $X” (shortfall) even when the prefill is higher because of the minimum.
- Primary: **Pay** → Stripe PaymentSheet / Checkout flow.
- After success: brief confirmation (“$Y added” in USD equivalent as returned by account refresh) → **return the user to where they came from**, preserving that screen’s state:
  - From Clear · Confirm (insufficient funds) → back to **Confirm** with the same tonnes, class, attribution, and message still filled; refresh balance/quote.
  - From Account → back to **Account**.
  - From Home (if Add funds is offered there) → back to **Home**.

**Interactions**

- Validate minimum before calling `POST /account/deposit`.
- Cancel Stripe / abandon Checkout → stay on Deposit (or return to caller without changing balance — same origin rule).
- Failure → inline error, retry.
- No crypto deposit options.
- Deep link / return URL from Stripe Checkout must restore the **same entry route** (e.g. confirm with params/session), not a generic Home redirect.

---

## Global chrome and states


| Element      | Behavior                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Tab bar      | Home · History · Account (signed-in only).                                                          |
| Auth gate    | Any deep link into evaluate/clear without session → Welcome, then resume intent if practical.       |
| Cold start   | First API call may spin longer; prefer retry with message over instant hard fail.                   |
| Errors       | Inline on the screen that caused them; use `{ error }` copy when safe. Never show wholesale fields. |
| Connectivity | Offline: disable primary submits; show a single banner.                                             |


---

## Flows

### A. First-time: estimate → fund → clear → certificate

```
Welcome → Sign in → Home
  → Evaluate → Result (edit tonnes)
    → Class → Confirm
      → (insufficient) Deposit → Confirm
        → Progress → Certificate → Home
```

Quota decrements on successful Estimate. Quota resets to 10 when clearing settles / pending_index capture completes. Balance debited at marked-up `userTotal`.

### B. Estimate only (no money yet)

```
Home → Evaluate → Result → Done → Home
```

User may leave with a mental note (or we keep last suggestion in session for “Clear” prefill). Balance can stay $0.

### C. Known tonnage, already funded

```
Home → Clear → Amount → Class → Confirm → Progress → Certificate
```

### D. Quota exhausted

```
Home → Estimate (blocked) → Quota empty → Clear → …
```

After settle, Evaluate shows 10 evaluations again (Home does not surface the count).

### E. Insufficient funds mid-confirm

```
… → Confirm → Add funds → Deposit → (Stripe success) → Confirm (same prefilled state; refreshed quote/balance) → Progress → …
```

If the quote expired during deposit, refresh quote once before enabling Confirm again. Stripe return / cancel must not dump the user on a generic Home unless that was the entry point.

### F. Review a past certificate

```
History → (certificateUrl present) open certificate
History → (no URL yet) Clearing detail → refresh / View certificate when ready
```

### G. In-flight / ambiguous clearing

```
Progress (timeout) or History → Detail (submitted / pending_index)
  → refresh until settled + certificateUrl
```

Copy must not say “failed” while funds are reserved.

### H. Sign out

```
Account → Sign out → Welcome
```

---

## Copy guidelines

- Primary verb in the UI: **clear** / **clearing** / **cleared** (brand-aligned, emotional). Never lead with “offset.”
- Under the hood the product still **retires** credits (API paths, Klima, certificates). Keep `retire` / `retirement` in code, docs that describe mechanics, and field names (`retirementMessage`, `/retirements`). Do not put “retire” on buttons or headlines unless precision truly requires it.
- Say **estimate** for the LLM step; reserve **confirm** for the irreversible action.
- Money: always show user-facing USD totals from our API. If they paid in EUR, after deposit speak in USD balance (“About $X added”) once `/account` refreshes — do not invent FX UI beyond Stripe’s presentment choice.
- Permanence warning appears **once**, on Confirm — not on every prior step.
- Avoid explaining markup, Klima, or Base unless the user opens an optional About later (out of v1 scope).

---

## Out of scope for v1 UI

- Logged-out evaluation
- Choosing a custom on-chain beneficiary address / user wallet
- Browsing individual credit tokens
- Whole-tonne rounding / Puro amount rules (backend never offers those classes)
- Admin credit UI
- Marketing site inside the app
- Push notifications for `pending_index` → settled (poll on Detail/History is enough)

---

## Mapping to Phase M


| Plan item            | Screens / flows                                   |
| -------------------- | ------------------------------------------------- |
| M1 App shell         | Tabs, API client, cold-start handling             |
| M2 Auth and account  | Welcome, Home balance, Account, Deposit           |
| M3 Evaluate          | Evaluate, Result, Quota empty                     |
| M4 Quote and confirm | Amount, Class, Confirm, Progress, deposit handoff |
| M5 Certificate       | Certificate success, History, Detail              |
| M6 EAS               | Full A/C/E flows against staging                  |
