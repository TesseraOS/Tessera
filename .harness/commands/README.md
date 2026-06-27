# Commands

Commands are **named, repeatable entry points** into the workflow. These definitions are
canonical and tool-agnostic; Claude Code exposes them as slash commands via
[`../../.claude/commands/`](../../.claude/commands/), which point back here.

| Command | Purpose |
|---------|---------|
| [`next-feature`](next-feature.md) | Select & claim the next eligible feature (respecting `wip_limit`). |
| [`verify`](verify.md) | Run the verification gates and capture evidence. |
| [`checkpoint`](checkpoint.md) | Record progress and leave a clean state. |

Commands are thin: they orchestrate the relevant protocol/skill, they don't add new rules.
