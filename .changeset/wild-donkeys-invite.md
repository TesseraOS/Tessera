---
'@tessera/context-compiler': minor
'@tessera/knowledge-graph': minor
'@tessera/observability': minor
'@tessera/plugin-host': minor
'@tessera/ingestion': minor
'@tessera/retrieval': minor
'@tessera/billing': minor
'@tessera/storage': minor
'@tessera/config': minor
'@tessera/memory': minor
'@tessera/server': minor
'@tessera/skills': minor
'@tessera/core': minor
'@tessera/api': minor
'@tessera/cli': minor
'@tessera/mcp': minor
'@tessera/sdk': minor
'@tessera/ai': minor
---

First public release (`0.1.0`).

Not `1.0.0`: the API surface is young and `1.0.0` is a promise about stability this project has not
yet earned (ADR-0062 §4). `minor` from `0.0.0` produces `0.1.0`.

All eighteen packages move together — they are declared `fixed` in the changesets config, because
`@tessera/cli` hard-depends on the rest of the closure and a version skew between them is an install
failure rather than a build failure.
