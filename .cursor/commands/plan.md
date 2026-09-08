# /plan — Update the implementation plan and ship it

For ClearMyCarbon: **[docs/plan.md](../../docs/plan.md)** is the implementation sequence (backend → staging → API freeze → mobile) and the API contract. This command updates that doc from the user’s request, then executes the work so the repo matches the plan. Do not leave plan and code out of sync.

## Workflow

Copy and track:

```
Plan change:
- [ ] 1. Read current plan + affected code
- [ ] 2. Edit docs/plan.md
- [ ] 3. Implement to match the updated plan
- [ ] 4. Align other docs if needed
- [ ] 5. Check off Done when / bullets that are truly done
- [ ] 6. Summarize plan + code deltas
```

### 1. Read current plan + affected code

- Read [docs/plan.md](../../docs/plan.md) (the phase, side plan, or API contract section the change touches).
- Skim related constraints in [docs/product.md](../../docs/product.md), [docs/architecture.md](../../docs/architecture.md), [docs/hosting.md](../../docs/hosting.md), and — for mobile UI — [docs/ux.md](../../docs/ux.md).
- Locate the matching code under `apps/backend/`, `apps/mobile/`, or packages as appropriate.

### 2. Edit `docs/plan.md` first

- Apply the user’s requested plan change **in the doc before** coding (unless they only asked to implement an already-written plan section — then skip edits and implement).
- Keep the existing structure: Sequence → phases (0 / B / S / API freeze / M) → side plans → API contract → order of work.
- Prefer precise edits to the relevant phase bullets, **Done when**, API contract, or order-of-work rows over rewriting the whole file.
- Preserve product rules: mobile never retires / never calls Klima; backend retires for markup; retirement is irreversible (**clear**); evaluate without funding, clear only when funded.
- Mark phases `[x]` **only** when **Done when** is actually true after implementation — not because related files exist.
- If the request conflicts with product/architecture/hosting choices or expands v1 scope, say so briefly and either adjust within bounds or ask before inventing extra apps, services, or crypto-wallet UX.

### 3. Implement to match the updated plan

- Change backend, mobile, infra, or types so they match the **updated** plan.md.
- Follow phase order unless the user explicitly scopes a later phase or a side plan.
- Backend: one file per route under `apps/backend/src/routes/`; tests colocated with each new/changed endpoint; mutating routes assert HTTP body **and** a DB re-read; use `requireEnv`; MSW mocks for outbound HTTP in tests.
- API types that mirror the frozen contract use an `API` prefix; `clerkId` stays internal (never in HTTP bodies).
- Mobile UI: **ux.md is law** for screens/copy/flows. If plan and ux disagree on UI, follow ux.md and update the plan to match.
- Relative TypeScript imports are extensionless. Match existing patterns; no drive-by refactors.

### 4. Align other docs only when needed

- Update [docs/product.md](../../docs/product.md), [docs/architecture.md](../../docs/architecture.md), [docs/hosting.md](../../docs/hosting.md), or [AGENTS.md](../../AGENTS.md) only when the plan change alters a decision those files own.
- Do not duplicate long API or phase specs into AGENTS.md; plan.md stays the implementation source of truth.
- UX screen/copy changes belong in ux.md (prefer `/ux` for those); only touch plan Phase M / API rows here when the implementation plan must reflect them.

### 5. Check off completed work

- After implementation, check `[x]` on bullets and **Done when** lines that are now true.
- Update the matching order-of-work row if present.
- Leave unchecked anything not yet meeting **Done when**.

### 6. Summarize

In a short reply:

1. What changed in `docs/plan.md` (phases / contract / side plans).
2. What changed in code (areas/files).
3. What was checked off vs still open.
4. Anything deferred (blocked, out of phase, unclear).

## Non-goals

- Pure UX/copy/screen redesign without a plan/API impact — use `/ux` instead.
- Committing or opening PRs unless the user asks.
- Inventing stack/hosting alternatives already chosen in architecture.md / hosting.md.

## Quick reference

| Concern | Source |
| --- | --- |
| Phases / Done when / order of work | `docs/plan.md` |
| API contract (frozen field names) | `docs/plan.md` (API freeze) |
| Screens / copy / flows | `docs/ux.md` |
| Product rules | `docs/product.md` |
| Stack / boundaries | `docs/architecture.md` |
| Hosts / regions | `docs/hosting.md` |
| Backend | `apps/backend/` |
| Mobile | `apps/mobile/` |
