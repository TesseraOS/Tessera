---
name: continuous-learning
description: After non-trivial work, extract reusable lessons (bug fixes, user corrections, workarounds, conventions) into the in-repo memory so the team and future sessions don't repeat mistakes.
---

# Skill: continuous-learning

Capture what was learned so it compounds. This is the disciplined version of the "capture
lessons" step in [clean-state](../../protocols/clean-state.md) and the
[definition-of-done](../../protocols/definition-of-done.md).

> Adapted (MIT) from ECC `continuous-learning` (© Affaan Mustafa) — see
> [`NOTICE.md`](../../../NOTICE.md). **Key adaptation:** lessons are written to the **in-repo
> system of record** ([`../../memory/lessons/`](../../memory/lessons/)), not a personal
> `~/.claude` store — the repository is memory.

> **Companion:** [`skill-observer`](../skill-observer/SKILL.md) captures *harness* improvements
> (skill/rule/ADR changes) as you work; this skill captures durable *lessons* (what happened).
> Same discipline — signal over noise — pointed at two different targets.

## When to capture
- After fixing a non-obvious bug (write the root cause + the fix).
- After a **user correction** (record the preference/standard so it isn't repeated).
- After a framework/library workaround, a tricky debugging path, or discovering a project
  convention.
- At session end (part of [clean-state](../../protocols/clean-state.md)).

## What counts (and what doesn't)
Capture **reusable, non-obvious** lessons. **Do not** record: one-off trivia, restatements
of existing rules/ADRs, or anything already true in the repo. Signal over noise — a few
durable lessons beat many shallow ones.

## Steps
1. **Name the lesson** and its category: error-resolution · user-correction · workaround ·
   debugging-method · convention.
2. **Check for an existing entry** in [`../../memory/`](../../memory/) ([index](../../memory/index.md)) —
   update it rather than duplicate; supersede if it's now wrong.
3. **Write** `../../memory/lessons/<kebab-slug>.md` using the frontmatter format in
   [`../../memory/README.md`](../../memory/README.md) (`kind: lesson`, links, confidence,
   created date). State the lesson, the *why*, and how to apply it.
4. **Link** related decisions/lessons inline (`[[slug]]`), and add a line to the
   [memory index](../../memory/index.md).
5. If the lesson implies a durable rule change, propose a [rule](../../rules/) edit or an
   [ADR](../write-adr/SKILL.md) — memory records what happened; rules/ADRs change what we do.

> Future enhancement (deferred): an optional Claude Code `Stop` hook could prompt for lesson
> extraction at session end. We rely on the clean-state protocol first (no auto-LLM-eval on
> every session).
