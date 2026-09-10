# UX

Mobile UX for **ClearMyCarbon**. Product rules: [product.md](product.md). API surface: [plan.md](plan.md#api-contract-freeze-before-mobile). This document is the screen and flow source of truth for Phase M — implement against it, not against any earlier prototype.

## Principles

1. **One primary job.** Open the app → optionally estimate your carbon footprint → fund if needed → clear → leave with a certificate. Everything else supports that loop.
2. **Evaluate freely, clear carefully.** Estimation is cheap and reversible in spirit (a suggestion). Clearing is permanent: show amount, marked-up cost, and certificate attribution, then require an explicit confirm.
3. **No crypto theater.** Users never see wallets, chain IDs, wholesale Klima prices, or x402. Funds are fiat (USD). The certificate is the proof.
4. **Suggestion, not decree.** The LLM estimate is editable. The user owns the final tonnage.
5. **Fund only when it matters.** Evaluation works with a zero balance. Prompt to deposit at the moment clearing would fail, not before.
6. **Quota motivates without nagging.** Show remaining evaluations on the Evaluate flow. At zero, the path forward is clear (which resets to 10), not “buy more evaluations.”
7. **Enter submits.** Forms use a shared submit action: pressing **Enter** on a **single-line** field (or the primary CTA) runs that action when it would be enabled by tap — not a secondary or destructive control. **Multiline / textarea fields do not submit on Enter** — Enter inserts a newline; the user taps the primary CTA to submit.
8. **Busy CTAs show a ripple spinner, not mutating copy.** While a primary action is in flight, keep the button’s accessible name as the stable action label (e.g. **Add funds**, **Sign in**) and show an indeterminate **ripple** indicator in place of the label. Do not swap the visible/accessible text to “Starting…”, “Signing in…”, etc. Disable the control and expose busy state to assistive tech.

## Information architecture

```
Signed out
  └─ Welcome / Sign-in
        └─ Reset password (email → code + new password)

Signed in (tab shell)
  ├─ Home
  ├─ History
  └─ Funds
        └─ Deposit (modal / stack)
  ├─ Profile (from header icon; tab bar stays visible)
  └─ Evaluate (early: activity input / quota empty; tab bar stays visible)
        └─ Evaluate result → handoff into Clear (tab bar hidden)

Flows (pushed stacks, tab bar hidden)
  └─ Clear: amount → class → confirm → progress → certificate
```

Tabs stay at three (**Home · History · Funds**). Profile and early Evaluate are still **flows** launched from Home / header — not permanent tab buttons — but they keep the **tab bar** so the user can jump to Home, History, or Funds. Once Evaluate reaches **result** (or the user continues into Clear / Deposit), hide the tab bar so the clearing tunnel stays focused.

---

## Screens

### 1. Welcome / Sign-in

**Purpose.** Brand + authenticate. First impression for signed-out users.

**Content**

- **Logo mark** + product name: ClearMyCarbon (hero-level, not a nav eyebrow). Same mark as the signed-in brand header.
- Tagline: **Make peace with your carbon footprint.**
- Primary CTA: Continue / Sign in (Clerk).
- Secondary: Create account (same Clerk flow if separate). Sign-up shows the same compact logo + name at the top (not a second hero treatment).
- Tertiary: **Forgot password?** → **Reset password**.

**Interactions**

- Tap sign-in / sign-up → Clerk UI (email, Apple, Google — whatever Clerk is configured for).
- Tap Forgot password? → **Reset password**.
- Success → land on **Home**.
- No browse-as-guest. Auth is required (matches API: evaluate and account need a session).

**Not on this screen**

- Funds, classes, sample certificates, feature grids, or “how it works” carousels.

---

### 1b. Reset password

**Purpose.** Recover access when the user forgot their password. Entirely via Clerk (email code); no ClearMyCarbon API call.

**Content**

- Compact logo + name (same as Sign-up — not a second hero).
- Title: Reset password.
- Step 1 — email: Email field + primary **Send code**. Helper: we’ll email a one-time code.
- Step 2 — code + new password: muted line that a code was sent to the masked email; Verification code field; New password field; primary **Reset password**.
- Link back: **Back to sign in**.

**Interactions**

- Send code (non-empty email) → Clerk starts reset (`reset_password_email_code`); on success show step 2.
- Reset (code + password) → Clerk verifies and sets the new password; on `complete`, activate the new session → **Home**, and show a temporary **bottom success toast**: **Password updated** (auto-dismiss after a few seconds; does not block taps). The toast may appear on Home after the auth redirect — same message either way.
- Incorrect verification code → field error under Verification code: **Incorrect verification code. Please check your email and try again.** Stay on step 2.
- Invalid / expired code (other) → field error under Verification code; stay on step 2. Weak password → field error under New password; stay on step 2. Other failures → form summary above the fields.
- Back to sign in → Sign-in (discard in-progress reset).

**Not here**

- Security questions, SMS reset (v1 is email only), or account balance / product chrome.

---

### 2. Home

**Purpose.** Status at a glance and the two entry points: estimate your carbon footprint, or clear a known amount.

**Content**

- Brand (logo + ClearMyCarbon) lives in the **global header** — do not repeat the product name as a second hero on the body. Lifetime cleared tonnage is **not** shown in the header; History is the place to browse certificates and past clears.
- Optional light greeting or tagline under the header is fine; keep it quieter than Welcome.
- Primary CTA: **Estimate your carbon footprint** (evaluate flow).
- Secondary CTA: **Clear carbon** (clear flow with empty amount — user types tonnes).

**Interactions**

- Tap Estimate → **Evaluate**.
- Tap Clear → **Clear · Amount** (tonnes blank or last-used default none).
- Pull to refresh may refresh soft account state if needed.
- When evaluations remaining is **0**: Estimate CTA still opens **Evaluate**, which shows **Quota empty** (do not show the count on Home).

**Empty / first-run**

- Same layout. No fake stats. CTAs still work. Header right is **hidden** until the first successful clear (total > 0).

**Not on this screen**

- History list, certificate rows, or a “Latest certificate” teaser — those belong on **History** (and Clear success). Lifetime cleared is only in the header.
- Available balance (USD) — funds live on **Funds** (and Clear · Confirm when funding matters).
- “Add funds when you’re ready to clear” nudge — that belongs with funding entry points (Funds / Confirm), not Home.
- Profile name or sign-out — those live on **Profile** (header icon).
- API / health reachability status (no “API reachable” / staging probe card). Failures surface as errors on the load that failed, or via the offline banner — not a persistent diagnostics box.

---

### 3. Evaluate

**Purpose.** Turn a natural-language activity into a suggested tonnage. Does not require a funded balance. Consumes one evaluation only on success.

**Content**

- No screen title in the body (brand stays in the header).
- Multiline text field. Label: **Describe the activity that emitted carbon emissions**, with a help control on the right that opens a short modal (**Writing a good description**): ask for concrete details (distance or route, duration, number of people, vehicle or cabin class, how often); give example phrases; note that more detail yields a better estimate.
- Remaining count below **Estimate**: “N evaluations left”.
- Placeholder examples rotate lightly (mix of home energy, food, purchases, and transport — e.g. “I heated my apartment with gas for the whole winter.”, “I flew from Paris to New York round trip.”).
- Primary: **Estimate**.

**Interactions**

- Submit with non-empty text (tap **Estimate**) → loading (tolerate cold start) → **Evaluate result** on success. The activity field is a **textarea**: **Enter** inserts a newline and does **not** run Estimate.
- Ambiguous LLM (`evaluation_ambiguous`) → form summary above the activity field on a **soft gray** banner (not danger red). The API rationale (when present) must **name the specific missing details** to add (e.g. hours of use, distance, fuel type)—not only a ballpark figure—then the UI can append a short **try again** cue; quota **unchanged**; stay on this screen. Other LLM failures → same neutral summary style; same stay/quota rules.
- Quota already 0 → do not call API; show **Quota empty**.
- Back → Home.
- Tab bar remains visible on this screen (and on **Quota empty**).

**Not here**

- Class picker, price, deposit, or auto-clear.

---

### 4. Evaluate result

**Purpose.** Show the suggestion; let the user accept or edit before entering clear. Tab bar is **hidden** from this step onward into Clear.

**Content**

- Label: **Emissions estimation** (not “Suggested”), with a help control beside it that opens a short modal explaining that the figure is an **AI estimate only** — approximate guidance, not a measurement of real emissions — and that the user chooses the final amount before clearing.
- Suggested tonnes (prominent).
- Short rationale from the API (readable, not raw model dump).
- Editable tonnes field (pre-filled with `suggestedTonnes`).
- Primary: **Clear those emissions**.
- Secondary: **Estimate another activity** (back to Evaluate, fresh field).
- No Done / close control — leave via back, tabs (if any), or continuing into Clear.
- Updated “N evaluations left” from the response, **below the buttons**.

**Interactions**

- Help beside **Emissions estimation** → modal (AI estimate disclaimer); dismiss via Close or backdrop.
- Edit tonnes → **Clear those emissions** uses the edited value (client validation: ≥ 0.001).
- Clear those emissions → **Clear · Amount** with tonnes prefilled (skip re-entry), then class; also carry the original activity text into Confirm as a prefilled **message** (`retirementMessage`) — user can edit or clear it.
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
- Funds reminder only if useful: available USD (not a hard gate yet — gate at confirm).

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
- Funds line: Available $X · After clearing $Y (or “Need $Z more”).
- Warning: Clearing cannot be undone. The certificate attribution is permanent.
- Primary: **Confirm and clear** (destructive-weight styling, not casual).
- Secondary: Cancel / Back.

**Interactions**

- On appear (or on Continue from Class): `POST /quotes` with tonnes + class. Show spinner until quote returns. If quote fails, error + retry.
- If `available < userTotal`: primary becomes **Add funds to continue** → **Deposit** with `returnTo=confirm`, suggested amount = **max(shortfall, $5.00 minimum)** (USD), and shortfall for the “Needed…” hint. After successful deposit, **return to this Confirm screen** with fields still prefilled; refresh quote/balance.
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

### 13. Funds

**Purpose.** Funded USD balance and funding entry only. Not a profile/settings screen.

**Content**

- Title row: **Funds** on the left, USD amount prominent on the right — no “Available” label (the screen title already says Funds).
- Primary: **Add funds**.

**Interactions**

- Add funds → **Deposit**.
- Tab always available when signed in.
- No display of Clerk `user_…` ids; our user UUID only if needed for support (prefer hide).

**Not on this screen**

- First/last name, Edit, or Sign out — those belong on **Profile**.

---

### 13b. Profile

**Purpose.** Identity and session. Opened from the **header profile icon** (top right), not a tab.

**Content**

- Title: Profile.
- **First name** and **last name** (from Clerk), read-only until editing.
- Primary secondary: **Edit** — enters edit mode (first/last name fields + save).
- Destructive: **Sign out** — pinned to the **bottom** of the content area, directly above the tab bar (not inline under Edit). Hidden while editing names.

**Interactions**

- Open via the signed-in header’s profile icon (right side).
- Edit → edit first/last name → save via Clerk user profile update; success refreshes local profile and returns to read-only. Prefill on Clear · Confirm (`beneficiaryString`) should use the updated name on next visit.
- Sign out → Clerk sign-out → Welcome.
- Back → previous screen (usually the tab that was open).
- Tab bar remains visible (same three destinations); none of the tab buttons is selected.
- No display of Clerk `user_…` ids.

**Not here**

- Available balance or Add funds — those stay on **Funds**.

---

### 14. Deposit

**Purpose.** Fund the USD balance via Stripe. Minimum $5.00. The app is **USD-only** in the UI — no currency picker.

**Content**

- Title: Add funds.
- Amount field (USD major units). No currency toggle.
- Minimum hint: at least $5.00.
- When opened from insufficient funds: prefill suggested amount as **max(shortfall, $5.00)** — never below **$5.00**. Show “Needed for this clearing: $X” (shortfall) even when the prefill is higher because of the minimum.
- Primary: **Add funds** → Stripe PaymentSheet / Checkout flow (presentment **usd**).
- After success: bottom success toast (“$Y added to your account”) → navigate as follows:
  - From Clear · Confirm (insufficient funds / retire flow): open Deposit with `returnTo=confirm` (and shortfall/amount params as needed) → on success, back to **Confirm** with the same tonnes, class, attribution, and message still filled; refresh balance/quote. Do **not** treat `shortfallCents` alone as the return signal.
  - Otherwise (Funds, Home, or any non-clear entry) → **Home**.

**Interactions**

- Validate minimum ($5.00) before calling `POST /account/deposit` with `currency: usd`.
- Cancel Stripe / abandon Checkout → stay on Deposit (or return to caller without changing balance — same origin rule).
- Failure → form summary error above the fields, retry.
- No crypto deposit options; no EUR (or other) presentment choice in the app.
- Deep link / return URL from Stripe Checkout must restore the **same entry route** (e.g. confirm with params/session), not a generic Home redirect.

---

## Global chrome and states


| Element       | Behavior                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand header  | **Always** show the logo mark + **ClearMyCarbon** at the top when signed in (tab screens and stacked flows). Screen titles (“Estimate…”, “History”, etc.) stay in the body — they never replace the product name in the header. Back chevron may sit beside the brand on stacked screens. **Right side (trailing):** always a **profile icon** (person) that opens **Profile**. On Profile, keep the icon visible with a soft light-green (`accentSoft`) pill behind it (selected state) and do not push Profile again. Do **not** show lifetime cleared tonnage in the header — History is the place to browse certificates. |
| Logo          | One simple mark (leaf / cleared-air motif in brand forest green). Paired with the name in chrome and on Welcome. Mark alone only at tiny sizes (app icon / favicon). No crypto, globe-cliché overload, or decorative badges on the mark. |
| Tab bar       | Home · History · **Funds** (signed-in only). Each tab has a simple icon above the label (home / history / wallet or similar — not the person mark; that is header-only for Profile). The Funds tab label is **Funds**; the button also shows the **current available balance** (USD from `GET /account`, compact e.g. `$12.34`) so funding status is visible without opening the tab. Active tint uses brand accent; inactive is muted. Selected tab sits on a soft light-green pill (`accentSoft`) behind icon + label — not a harsh full-width block. Add a little bottom padding (and respect the safe-area inset) so icons and labels are not flush with the screen edge. **Visibility:** show on the three tabs, on **Profile**, and on **early Evaluate** (activity input and **Quota empty**). Hide on **Evaluate result** and for the rest of the clear / deposit / progress / certificate tunnel. While on Profile or early Evaluate, none of the three tab buttons is “selected” (all inactive/muted) — that is fine; do not invent a fourth tab highlight. |
| Auth gate     | Any deep link into evaluate/clear without session → Welcome, then resume intent if practical.                                                                                                            |
| Cold start    | First API call may spin longer; prefer retry with message over instant hard fail.                                                                                                                        |
| Errors        | Inline on the screen that caused them; never toasts; never wholesale fields. **Placement:** (1) **Field** validation (empty, min amount, weak password, incorrect verification code, invalid tonnes, etc.) → text **directly below** that field. (2) **Form / screen** failures (API, auth that isn’t tied to one field, load errors) → a single summary banner **above** the form fields (or at the top of the screen body for non-forms). Do not duplicate the same message in both places. Use `{ error }` copy when safe. Auth verification-code failures (sign-in MFA, sign-up, reset password): prefer **Incorrect verification code. Please check your email and try again.** under the code field. |
| Success toast | Ephemeral confirmation at the **bottom** of the content area — **above the tab bar** when the tab bar is visible (tabs, Profile, early Evaluate); never covers Home / History / Funds. Light green (`accentSoft`) with accent text. Auto-dismisses; not a modal. Uses: password reset success (**Password updated**); deposit success (**$Y added to your account**, or “Payment received — balance will update shortly” if the balance has not refreshed yet). Toast may appear on the screen after navigation. Do not use for errors (those stay inline). |
| Connectivity  | Offline: disable primary submits; show a single banner.                                                                                                                                                  |
| Form submit   | **Enter** on a **single-line** text field in a form runs the screen’s **primary** CTA (same enablement rules as the button). **Multiline / textarea fields never submit on Enter** (Enter = newline); the user taps the primary CTA. Never bind Enter to Cancel, Sign out, or other secondary/destructive actions. Do **not** treat an inserted newline character as a submit signal. |
| Busy buttons  | In-flight primary CTAs: **ripple spinner only** (no “Signing in…” / “Getting quote…” label swap). Stable `accessibilityLabel` = the idle action name; mark the control disabled + busy (`accessibilityState.busy` / `aria-busy`). Full-screen or section spinners (cold start, quote load before Confirm, Progress) stay as they are — this row is about the CTA itself. |


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
Home → Evaluate → Result → (back) → Home
```

User may leave with a mental note (or we keep last suggestion in session for “Clear” prefill). Funds can stay $0.

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
Header profile icon → Profile → Sign out → Welcome
```

### I. Reset password

```
Sign-in → Forgot password? → Reset password (email → code + new password)
  → (success, session active) → Home + bottom toast “Password updated”
```

---

## Copy guidelines

- Primary verb in the UI: **clear** / **clearing** / **cleared** (brand-aligned, emotional). Never lead with “offset.”
- Under the hood the product still **retires** credits (API paths, Klima, certificates). Keep `retire` / `retirement` in code, docs that describe mechanics, and field names (`retirementMessage`, `/retirements`). Do not put “retire” on buttons or headlines unless precision truly requires it.
- Say **estimate** for the LLM step; reserve **confirm** for the irreversible action.
- Money: **USD only** in the UI — balances, quotes, deposit amount, and success copy. Do not show a currency toggle or EUR amounts. Card networks may still bill the cardholder in their local currency; we do not surface that FX in the app.
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
- EUR (or multi-currency) presentment picker in the app — deposits are USD-only in the UI

---

## Mapping to Phase M


| Plan item            | Screens / flows                                   |
| -------------------- | ------------------------------------------------- |
| M1 App shell         | Tabs, brand header (logo + name + profile icon), API client, cold-start handling |
| M2 Auth and account  | Welcome, Sign-in, Reset password, Home CTAs, Funds (funded USD only), Profile (header), Deposit |
| M3 Evaluate          | Evaluate, Result, Quota empty                     |
| M4 Quote and confirm | Amount, Class, Confirm, Progress, deposit handoff |
| M5 Certificate       | Certificate success, History, Detail              |
| M6 EAS               | Full A/C/E flows against staging                  |
