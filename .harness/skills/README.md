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
| [`delegate-to-worker`](delegate-to-worker/SKILL.md) | Offload bulk work to the agy/Gemini worker (human-in-the-loop); Claude verifies. Build tooling only. |

New skills: keep them short, action-oriented, and linked from this index.
