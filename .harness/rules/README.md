# Rules (Constraints)

Rules are **always-follow** constraints — the boundaries inside which all work happens.
They are deliberately **modular** (not one giant instruction file), because a single
monolithic ruleset is skimmed, not followed.

## How rules are organized

| Path | Applies to |
|------|------------|
| [`common/`](common/) | everything (language-agnostic) |
| [`typescript/`](typescript/) | all TypeScript |
| [`api/`](api/) | backend (`apps/api`, server packages) |
| [`frontend/`](frontend/) | all web apps (`apps/web`; `apps/marketing` + `apps/docs` when they land — ADR-0035) |
| [`security/`](security/) | security-sensitive code everywhere |

Service-scoped harnesses (`../../apps/*/.harness/rules/`) may **add** rules. They may not
relax a global golden rule ([`../../AGENTS.md` §1](../../AGENTS.md)).

## Precedence
1. Golden rules in `AGENTS.md` (highest).
2. `security/` rules.
3. Service-scoped rules (more specific wins).
4. Area rules (`api/`, `frontend/`).
5. Language rules (`typescript/`).
6. `common/`.

When two rules genuinely conflict, the higher tier wins; if that produces a bad outcome,
that's a signal to write an [ADR](../skills/write-adr/SKILL.md), not to quietly deviate.

## Authoring
- One concern per file; keep each rule testable/observable where possible.
- State the rule, then the *why* in one line, then a short do/don't if helpful.
