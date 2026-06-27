# Protocols

Protocols are **named, ordered procedures** the harness invokes at specific moments. Unlike
rules (always-on constraints) and skills (how-to workflows), a protocol is a checklist with
a defined trigger and a defined "done."

| Protocol | Triggered |
|----------|-----------|
| [`initialization`](initialization.md) | at the start of every session |
| [`verification`](verification.md) | before declaring any work done |
| [`definition-of-done`](definition-of-done.md) | to decide if a feature is truly complete |
| [`clean-state`](clean-state.md) | at the end of every session |
| [`effect-link`](effect-link.md) | when a shared contract changes |
| [`observability`](observability.md) | when adding/operating runtime code |
