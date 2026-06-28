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

The last three are **general-purpose execution skills** (apply to any task), adapted from ECC
(MIT — see [`../../NOTICE.md`](../../NOTICE.md)); the rest are Tessera workflow skills.

New skills: keep them short, action-oriented, and linked from this index.
