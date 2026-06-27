# apps/web — service-scoped harness

This is the **dashboard** service harness. It **extends the global harness**
([`../../../.harness/`](../../../.harness/)); global rules, skills, commands, protocols,
governance, and state all apply. Only **frontend-specific additions** live here.

- Service manual: [`../AGENTS.md`](../AGENTS.md)
- Service rules: [`rules/frontend.md`](rules/frontend.md) (read alongside the global
  [`frontend`](../../../.harness/rules/frontend/frontend.md) rule)

## Precedence
More-specific wins where strictly more constraining; a service rule may never relax a global
golden rule ([`../../../AGENTS.md` §1](../../../AGENTS.md)). Shared **state** and **memory**
remain global — the dashboard does not fork them.
