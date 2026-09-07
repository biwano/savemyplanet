# /ux — Update UX law and ship it

For ClearMyCarbon: **[docs/ux.md](../../docs/ux.md) is law** for mobile screens, copy, interactions, and navigation. This command updates that doc from the user’s request, then changes the app to match. Do not leave doc and UI out of sync.

## Workflow

Copy and track:

```
UX change:
- [ ] 1. Read current law + affected screens
- [ ] 2. Edit docs/ux.md
- [ ] 3. Implement in apps/mobile
- [ ] 4. Align plan / other docs if needed
- [ ] 5. Summarize doc + code deltas
```

### 1. Read current law + affected screens

- Read [docs/ux.md](../../docs/ux.md) (full file or the sections the change touches).
- Skim related product constraints in [docs/product.md](../../docs/product.md) when the change affects funding, evaluate vs clear, or certificates.
- Locate the matching routes under `apps/mobile/app/` (and shared UI/helpers under `apps/mobile/`).

### 2. Edit `docs/ux.md` first

- Apply the user’s requested UX change **in the doc before** coding (unless they only asked to implement an already-written ux.md section — then skip edits and implement).
- Keep the existing structure: Principles → Information architecture → Screens → Flows → Copy guidelines → Out of scope → Phase M mapping.
- Prefer precise edits to the relevant screen/flow sections over rewriting the whole file.
- Preserve product vocabulary: UI says **clear** / **estimate** / **confirm**; mechanics/API may still say retire. No crypto theater (wallets, Klima wholesale, x402) in user-facing copy.
- If the request conflicts with Principles or Out of scope, say so briefly and either adjust within those bounds or ask before expanding v1 scope.

### 3. Implement in `apps/mobile`

- Change screens, navigation, copy, and interactions so they match the **updated** ux.md.
- If existing code disagrees with ux.md, **follow ux.md** — do not preserve a mismatched screen “because it’s already there.”
- Do not invent extra tabs, apps, or flows not in the information architecture.
- Mobile never retires and never calls Klima/x402; clearing goes through the backend API only.
- Match existing Expo Router / component patterns in the app; no drive-by refactors.

### 4. Align other docs only when needed

- If [docs/plan.md](../../docs/plan.md) Phase M rows or screen lists contradict the new UX, update them to match ux.md.
- Do not duplicate long UX specs into AGENTS.md or product.md; ux.md stays the screen source of truth.

### 5. Summarize

In a short reply:

1. What changed in `docs/ux.md` (sections).
2. What changed in the mobile app (screens/files).
3. Anything deferred (needs API, out of v1, unclear).

## Non-goals

- Backend retirement logic, Stripe/Klima provider work, or API contract changes — unless the UX change **requires** a documented API update; then flag it and only proceed if the user wants that scope.
- Committing or opening PRs unless the user asks.

## Quick reference

| Concern | Source |
| --- | --- |
| Screens / copy / flows | `docs/ux.md` |
| Product rules | `docs/product.md` |
| API contract | `docs/plan.md` (API freeze) |
| Implementation | `apps/mobile/` |
