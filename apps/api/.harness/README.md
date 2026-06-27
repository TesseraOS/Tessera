# apps/api — service-scoped harness

This is the **backend** service harness. It **extends the global harness**
([`../../../.harness/`](../../../.harness/)); the global rules, skills, commands, protocols,
governance, and state all apply. Only **service-specific additions** live here.

- Service manual: [`../AGENTS.md`](../AGENTS.md)
- Service rules: [`rules/backend.md`](rules/backend.md) (read alongside the global
  [`api`](../../../.harness/rules/api/api.md) and
  [`security`](../../../.harness/rules/security/security.md) rules)

## Precedence
More-specific wins: a rule here overrides a global rule **only** where it is strictly more
constraining. A service rule may never relax a global golden rule
([`../../../AGENTS.md` §1](../../../AGENTS.md)). Shared **state** (feature_list, effects,
progress) and **memory** remain global — services do not fork them.
