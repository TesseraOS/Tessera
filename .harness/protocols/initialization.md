# Protocol: Initialization

**Trigger:** the start of every session. Initialization needs its own phase — skipping it
is how agents lose continuity and overreach.

## Checklist
1. **Read the manual.** [`../../AGENTS.md`](../../AGENTS.md) (golden rules + loop).
2. **Load active state.**
   - [`../state/progress.md`](../state/progress.md) — last 1–3 entries (where we stopped).
   - [`../state/feature_list.json`](../state/feature_list.json) — the `in_progress` feature,
     or the next eligible one.
   - [`../state/effects.json`](../state/effects.json) — relevant to the area you'll touch.
3. **Load relevant constraints & knowledge.** The [rules](../rules/) for the files in
   scope; related [memory](../memory/) and [ADRs](../../docs/adr).
4. **Confirm a healthy environment.** Run `scripts/init.ps1` (Windows) / `scripts/init.sh`
   (POSIX): toolchain present, versions match [`.nvmrc`](../../.nvmrc), state files valid.
5. **Reconcile reality vs record.** `git status` should match what `progress.md` claims.
   If not, fix the discrepancy before new work.
6. **Confirm WIP.** At most one `in_progress` feature. Resume it; don't start another.

## Done when
You know exactly which single feature you're working, its acceptance criteria, the rules
that apply, and that the environment is healthy.
