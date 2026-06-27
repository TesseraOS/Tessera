# Policy: ADR (when a decision must be recorded)

Binding. Operationalized by the [`write-adr`](../skills/write-adr/SKILL.md) skill and the
[documentation rule](../rules/common/documentation.md).

## An ADR is REQUIRED when you:
- Choose, replace, or significantly configure a **technology, framework, protocol, or data
  model**.
- **Deviate** from an existing ADR or a documented default. (Deviating without an ADR is a
  governance violation.)
- Introduce a **new external dependency**, **trust boundary**, or **cross-cutting concern**
  (auth, tenancy, tracing, caching strategy).
- **Resolve a PRD open question** (`OQ*`) — the ADR must exist *before* code that depends on
  the resolution is written.
- Make a decision that is **expensive to reverse** or that future contributors would
  otherwise have to reverse-engineer.

## An ADR is NOT needed for:
- Routine implementation choices well within an existing ADR's envelope.
- Local naming/refactoring that changes no contract or decision.

## Lifecycle
`Proposed → Accepted → (Deprecated | Superseded by ADR-NNNN)`. Never edit an accepted ADR's
decision in place to reverse it — write a **new** ADR that supersedes it, and update the old
one's status. Keep the [ADR index](../../docs/adr/README.md) current.

## Status discipline
- `Proposed` decisions must not be silently treated as final; they need sign-off.
- Code may rely only on `Accepted` decisions.
