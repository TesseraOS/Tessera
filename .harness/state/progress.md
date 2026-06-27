# Progress log

Session-by-session record so any agent can resume from files alone. Newest entries on top.
Each entry: date · what changed · evidence/verification · decisions · next step.

---

## 2026-06-28 — Phase B.2 fix: agy works in a real terminal (correction) + wrapper hardening
**Correction:** a real-terminal run proved `agy` is **not** hung/broken — the log
(`logs/agy/worker-*.log`, gitignored) shows **silent keyring auth succeeded**
(kumarashishranjan4971@gmail.com, model Gemini 3.5 Flash) and it **streamed from Gemini**;
it stopped only because the user pressed Ctrl+C (~70s in, following my premature "it's hung"
advice). Root cause of the *apparent* stall: `agy --print` emits nothing until the full
response is ready. (Claude's non-TTY sandbox still can't drive agy — that part stands.)

**Wrapper hardening (agy-worker.ps1/.sh):**
- **Default to interactive** (`-i`): visible progress + tool-review approvals. `-Headless`/
  `--headless` opts into `--print` (with a "silent until complete, don't Ctrl+C" warning).
- **Dirty-tree guard:** run mode refuses to switch branches with uncommitted changes (it had
  carried B.2 work onto the worker branch) unless `-AllowDirty`/`--allow-dirty`.
- **Docs fix:** `pwsh` -> `.\scripts\agy-worker.ps1` / `powershell -File` (user has PS 5.1,
  not PowerShell 7). Added the `agy` auth prereq note.
- ADR-0012 Context updated with the evidence.

**To validate F-031 end-to-end (human):** `agy models` (confirm auth), then
`.\scripts\agy-worker.ps1 -Spec <narrow-spec> -Branch feat/<id>-worker -Dir <narrow-dir>`
(interactive), let it finish, then Claude verifies the branch.

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.2: agy/Gemini worker integration (human-in-the-loop)
**What changed**
- **ADR-0012** (supersedes the deferral): adopt `agy`/Gemini as an OPTIONAL, human-in-the-loop,
  build-phase worker — never a product dependency.
- [`delegate-to-worker` skill](../skills/delegate-to-worker/SKILL.md) + `.claude` command/skill
  shims: Claude plans the scoped spec + independently verifies; a human runs the worker.
- Guarded wrappers [`scripts/agy-worker.ps1`](../../scripts/agy-worker.ps1) + `.sh`: preflight,
  dedicated branch, scoped `--add-dir`, timeout + log, **forbids `--dangerously-skip-permissions`**,
  no secrets, `-Check` dry-run.
- Governance: tool-access "deferred" -> "adopted (human-in-the-loop)". Feature **F-031** (in_review).

**Key finding:** `agy` v1.0.13 is installed, but `agy models` / `agy -p` **hang with a 0-byte
log** when driven by a non-TTY process (this sandbox) — the documented Windows/console limit.
So Claude **cannot** drive `agy`; a human runs it in a real terminal. Full automation is
out of reach on this setup (revisit on WSL/native per ADR-0012).

**Evidence/verification**
- `agy-worker.ps1 -Check` dry-run + link-check + verify-state (see B.2 verification run).
- Real end-to-end delegation is **pending a human run** (I can't execute agy headless).

**Next step:** coding — claim **F-001** (scaffold); use `delegate-to-worker` for bulk subtasks
once we're in implementation.

---

## 2026-06-27 — Phase B.1 addendum: governance policy model + ecosystem positioning
**What changed** (after reviewing Databricks **Omnigent**, a meta-harness)
- Added [`.harness/governance/policy-model.md`](../governance/policy-model.md): static +
  **stateful/contextual** policies (scopes, post-action triggers, resource-scoped writes,
  cost budgets, **egress-proxy credential injection**), with an honest enforcement matrix.
  Wired into governance README + tool-access.
- Product positioning: PRD **NG7** (Tessera is *not* an orchestrator) + new **§5.1 Ecosystem
  & interoperability**; ARCHITECTURE §2 "Ecosystem position". Tessera = MCP context/memory
  layer **complementary** to meta-harnesses (Omnigent); it fills Omnigent's context gap.

**Decision** (AskUserQuestion): adopt the stateful governance model + interoperability
positioning; do **not** build orchestrator/sandbox/live-session infra (out of scope).

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.1: pre-code hardening (gaps from brief review)
**What changed**
- Added the **design system**: [`docs/design/DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md)
  (tokens via tweakcn/shadcn, layout via efferd, components via coss/shadcn, motion, full UX
  baseline, a11y, perf) + **ADR-0009** (frontend stack locked; responsive web, **not PWA**).
- Captured two dropped brief items: **ADR-0011** billing via Dodo Payments (R2 direction) and
  **ADR-0010** CI/CD via GitHub Actions. Updated the ADR index.
- Added [`docs/REQUIREMENTS-COVERAGE.md`](../../docs/REQUIREMENTS-COVERAGE.md) tracing the
  entire original brief → PRD/ADR/harness, or gap.
- PRD: +FR-61 (billing), +NFR-15 (CI/CD), +NG6 (no PWA), design-system references.
- Code harness made explicit: [`F-001 scaffold plan`](../plans/F-001-monorepo-toolchain-scaffold.md)
  (tsconfig strict flags, eslint boundary rule, prettier, vitest, turbo, CI, scripts→gates);
  frontend rule now binds to the design system.
- State: +F-028 (UI foundation, R0), +F-029 (CI/CD), +F-030 (billing, R2); F-014 now
  blockedBy F-028; +effect E-004 (design tokens → all components).

**Evidence/verification**
- `node scripts/verify-state.mjs` valid (30 features, 4 effect-links); link-check 0 broken
  (see verification run for this session).

**Decisions** (via AskUserQuestion): capture billing now/build R2 (Dodo); responsive web not
PWA; lock frontend stack ADR now.

**Next step**
- Coding phase: claim **F-001** (scaffold) — plan already written.

---

## 2026-06-27 — Phase B: agent harness built
**What changed**
- Built the tool-agnostic global harness under [`.harness/`](../) plus root
  [`AGENTS.md`](../../AGENTS.md) (mandatory) and [`CLAUDE.md`](../../CLAUDE.md).
- Authored: instructions (workflow, session-lifecycle), modular rules
  (common/typescript/api/frontend/security), skills (add-feature, write-adr, effect-trace,
  verify-gate), commands (next-feature, verify, checkpoint), protocols (initialization,
  verification, definition-of-done, clean-state, effect-link, observability), governance
  (commit, secrets, tool-access, adr), plans (README + TEMPLATE), verification
  (gates.json + checklist).
- Seeded state: this log, [`feature_list.json`](feature_list.json) (R0 features F-001…F-016
  detailed + R1–R3 backlog F-017…F-027), [`effects.json`](effects.json) (invariants
  E-001…E-003), and JSON schemas.
- Added the Claude Code adapter ([`.claude/`](../../.claude/)) with settings, command shims,
  and planner/generator/evaluator subagents.
- Added `scripts/init.ps1` + `init.sh` + `scripts/verify-state.mjs`.
- Added service-scoped harness stubs under `apps/api` and `apps/web` (extend root).

**Evidence/verification**
- `node scripts/verify-state.mjs` — state files valid (see Phase B verification entry).
- Internal markdown link-check across the harness — 0 broken.

**Decisions**
- Harness is agnostic-core (`.harness/`) + thin Claude adapter (`.claude/`), mirroring the
  product's agent-agnostic stance. Recorded in memory [[harness-model]].

**Next step**
- Begin the coding phase: claim **F-001** (monorepo & toolchain scaffold) via
  [`/next-feature`](../commands/next-feature.md); that activates the pending-toolchain gates.

---

## 2026-06-27 — Phase A: product definition shipped
**What changed**
- Brand finalized **Tessera** / `@tessera/*` (ADR-0008; supersedes ContextOS).
- Wrote [`docs/PRD.md`](../../docs/PRD.md) (FR-*/NFR-* ids), 
  [`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md),
  ADRs 0001–0008 (Accepted), glossary, roadmap; repo hygiene; `git init`.

**Evidence/verification**
- Internal link-check: 78 links, 0 broken. Branding scan: only intentional codename refs.
- Committed as `aaaf84f` (genesis commit on `main`, no remote).

**Decisions**
- Locked Drizzle (ADR-0005), Transformers.js/Ollama + sqlite-vec→pgvector (ADR-0006).

**Next step**
- Phase B (harness) — done in the entry above.
