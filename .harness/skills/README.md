# Skills

Skills are **reusable, step-by-step workflows** for recurring tasks. They are canonical
and tool-agnostic; each lives in its own folder as `SKILL.md` with a small frontmatter
(`name`, `description`). Claude Code surfaces them via thin shims in
[`../../.claude/skills/`](../../.claude/skills/) — the content here is the source of truth.

| Skill | Use when |
|-------|----------|
| [`add-feature`](add-feature/SKILL.md) | Implementing the next feature end-to-end. |
| [`write-adr`](write-adr/SKILL.md) | A significant or default-deviating decision is made. |
| [`effect-trace`](effect-trace/SKILL.md) | Before declaring done — find/record what a change affects. |
| [`verify-gate`](verify-gate/SKILL.md) | Running the verification gates and capturing evidence. |
| [`coding-standards`](coding-standards/SKILL.md) | Applying the baseline quality conventions (write / review / refactor / onboard). |
| [`strategic-compact`](strategic-compact/SKILL.md) | Compacting context deliberately at task boundaries. |
| [`continuous-learning`](continuous-learning/SKILL.md) | Capturing reusable lessons into in-repo memory. |
| [`skill-observer`](skill-observer/SKILL.md) | Improving the harness itself — capture observations, drain them into skill/rule/ADR changes. |
| [`build-ui`](build-ui/SKILL.md) | Building a dashboard UI feature end-to-end (server-first, tokens, compose, UX baseline, a11y). |
| [`shadcn`](shadcn/SKILL.md) | Finding / installing / composing / customizing shadcn/ui components. |
| [`frontend-craft`](frontend-craft/SKILL.md) | Typography, spacing, restraint — avoiding generic UI. |
| [`motion`](motion/SKILL.md) | Functional, `prefers-reduced-motion`-safe animation. |
| [`design-review`](design-review/SKILL.md) | Auditing a built/changed screen against design anti-patterns before UI is done. |
| [`marketing-ui`](marketing-ui/SKILL.md) | Building a marketing-site (`apps/marketing`) page/section — MARKETING-DESIGN archetypes, honest content, design-lint. |
| [`contrast-checker`](contrast-checker/SKILL.md) | Verifying/fixing WCAG AA contrast (≥ 4.5:1 body, ≥ 3:1 large/non-text) across every theme × mode. |

`coding-standards`, `strategic-compact`, and `continuous-learning` are **general-purpose execution
skills** (adapted from ECC, MIT); `skill-observer` extends that self-improvement loop (adapted
CC BY 4.0). `build-ui`, `shadcn`, `frontend-craft`, `motion`, `design-review`, `marketing-ui`, and
`contrast-checker` are the
**frontend/design** skills — subordinate to
[`DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md) for the dashboard and to
[`MARKETING-DESIGN.md`](../../docs/design/MARKETING-DESIGN.md) for the public surfaces
(ADR-0042). The rest are Tessera workflow skills. All
adaptations are attributed in [`../../NOTICE.md`](../../NOTICE.md).

New skills: keep them short, action-oriented, and linked from this index.
