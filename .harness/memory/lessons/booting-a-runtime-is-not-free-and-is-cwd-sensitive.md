---
id: booting-a-runtime-is-not-free-and-is-cwd-sensitive
kind: lesson
title: Booting the Local runtime is not a cheap wiring step (the transformers adapter loads its model at CREATION) and its relative storage paths resolve against process.cwd() — so tooling/tests that boot it must default to fake embeddings + absolute paths
links:
  - apps/cli/src/commands/init.ts
  - apps/cli/src/commands/source.ts
  - packages/ai/src/adapters/transformers/index.ts
  - packages/config/src/profiles/local.ts
  - packages/config/src/schema.ts
  - apps/cli/tests/e2e/init-source-add.e2e.test.ts
confidence: 0.9
created: 2026-07-19
---

Building `@tessera/cli` (F-052), two non-obvious properties of `createServerRuntime` /
`createLocalRuntime` shaped the design — both invisible until you actually boot it:

**1. The transformers embeddings adapter loads its model at CREATION, not first use.**
`createEmbeddings` for the default `transformers` provider does `await pipeline('feature-extraction', model)`
inside the factory, so *constructing the runtime* downloads/loads a ~90MB model (and needs the network the
first time). "Boot the profile" is therefore not free wiring — it is the heaviest thing the CLI does. This
is why `init`'s smoke-boot is **opt-in** (`--verify`), not the default: a scaffold command that downloads a
model on a fresh, possibly-offline machine is user-hostile. Corollary for **every** runtime-booting test:
default to `TESSERA_EMBEDDINGS_PROVIDER=fake` (+ `TESSERA_EMBEDDINGS_DIMENSION`) — the config integration
tests already do this for exactly this reason. Booting with the real provider in a unit/e2e path makes it
slow and network-dependent.

**2. Relative storage paths in the config resolve against `process.cwd()` — not any injected cwd.**
The Local profile hands `config.storage.{sqlitePath,vectorPath,blobRoot}` straight to Node fs, which
resolves relative paths against the *process* working directory. So a command's own `io.cwd` abstraction
does **not** decide where the runtime writes: run `tessera init` then `tessera source add` from the same
directory and the relative `.tessera/...` paths line up; run them from elsewhere and the runtime creates a
second data dir under the process cwd. Two consequences: (a) document that runtime-booting CLI commands are
cwd-sensitive (or pass absolute paths); (b) integration tests can't rely on `io.cwd` to isolate storage —
either `process.chdir` (fragile across parallel test files) or, cleaner, make the written config use
**absolute** paths (an absolute `--data-dir` to `init`), which needs no chdir and is what the F-052 e2e does.

General principle: a "just wire it up" composition root can carry real cost and real environment coupling.
Before you boot it in a fast path (a scaffold, a unit test, a `doctor`), ask what constructing it actually
*does* — read the adapter factory, not the interface.
