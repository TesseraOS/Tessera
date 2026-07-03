# Memory index

One line per memory entry. Keep newest-relevant at top of each section.

## Decisions
- [stack-and-architecture](decisions/stack-and-architecture.md) — the locked stack & architecture, linking ADRs 0001–0008.

## Lessons
- [verify-cloud-adapter-env-guarded-against-a-container](lessons/verify-cloud-adapter-env-guarded-against-a-container.md) — a cloud adapter reaches port-parity by passing the SAME conformance suite; env-guard its integration tests (skip by default) and verify for real against a Docker Compose service.
- [generate-sdk-types-from-live-swagger-thin-client](lessons/generate-sdk-types-from-live-swagger-thin-client.md) — generate an SDK's types from the API's own OpenAPI (`buildServer({}).swagger()`, static schemas) + a thin typed client; commit + lint/format-ignore the generated file but keep it typechecked.
- [sse-test-real-socket-and-subscribe-before-handshake](lessons/sse-test-real-socket-and-subscribe-before-handshake.md) — test SSE/streaming endpoints over a real socket (not `app.inject`), and subscribe to the event source before writing the opening frame so no event is lost during setup.
- [cache-key-must-fingerprint-every-output-affecting-input](lessons/cache-key-must-fingerprint-every-output-affecting-input.md) — a reproducibility/cache key must hash every output-affecting input AND each pluggable strategy's `id` (normalized: effective defaults, sorted lists); a too-narrow key silently serves stale results.
- [surface-new-behavior-via-existing-explainability-field](lessons/surface-new-behavior-via-existing-explainability-field.md) — make new stage behavior (e.g. compiler compression) visible through an existing `whyIncluded`/trace channel instead of a new cross-package schema field, so the change stays in one package.
- [enum-driven-contract-additive-variant](lessons/enum-driven-contract-additive-variant.md) — derive downstream validation/typing (`z.enum(CONST)`, opaque tags, fallback lookups) from one source-of-truth enum so adding a variant (e.g. the temporal signal) ripples nowhere.
- [auto-extraction-structural-memory-seam](lessons/auto-extraction-structural-memory-seam.md) — feed one package's output into another (ingestion→memory) via a structural interface + an additive `DocumentSink` decorator (no dep/cycle); key auto-records on a stable `source` id for idempotency.
- [fair-deterministic-eval-design](lessons/fair-deterministic-eval-design.md) — design "beats baseline" evals so the system wins for attributable reasons, with deterministic backends; assert component wins not just the aggregate.
- [hybrid-fusion-shared-ref-space](lessons/hybrid-fusion-shared-ref-space.md) — RRF fuses by rank (no score normalization); signals only combine when retrievers share a `ref` id space (an ingestion-wiring requirement).
- [adapter-parity-shared-pure-core](lessons/adapter-parity-shared-pure-core.md) — when multiple adapters must return identical results, share one pure ranking/selection function; the conformance suite then proves parity.
- [zod-exactoptional-bridge](lessons/zod-exactoptional-bridge.md) — Zod `.optional()` infers `T | undefined`, clashing with `exactOptionalPropertyTypes`; bridge in a mapper, don't loosen types.
- [ingestion-redaction-terminal-gate](lessons/ingestion-redaction-terminal-gate.md) — enforce security invariants (secret redaction) as a fixed terminal pipeline stage, not optional config; keep emitted source ASCII-clean.
- [turbo-cache-stale-uncommitted](lessons/turbo-cache-stale-uncommitted.md) — turbo gave false-green on uncommitted changes; gate tasks now `cache: false`.
- [gitignore-broad-dir-hid-package](lessons/gitignore-broad-dir-hid-package.md) — bare `storage/` ignore rule excluded the whole `packages/storage` package; anchor ignore patterns + verify `git ls-files`.
- [auth-control-plane-default-none-additive](lessons/auth-control-plane-default-none-additive.md) — add auth as an injected port whose default adapter is zero-auth full-access, so enforcement is opt-in and existing routes/tests stay green; RBAC = pure roles→permissions ∩ token scopes; carry `tenantId` but keep row-isolation + OIDC honest seams.
- [reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling](lessons/reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling.md) — share a contract (auth model) across surfaces by importing it type-only + injecting the runtime at the composition root, so one surface's heavy runtime (Fastify) never leaks into another (MCP); consume the data, not the constructors.
- [fastify-free-subpath-for-composition-root-reuse](lessons/fastify-free-subpath-for-composition-root-reuse.md) — when the composition root must build a capability whose code lives in a heavy-runtime package (Fastify), expose a Fastify-free subpath export of just the transport-agnostic core (model+ports+adapters, minus the framework plugin) and import that; a value import pulls the whole module graph, so verify by grepping.
- [open-core-domain-package-plus-provider-port](lessons/open-core-domain-package-plus-provider-port.md) — model a paid capability (billing) as a domain package + provider port whose default adapter is a real local/free OSS implementation; verify a provider you can't call live by unit-testing its signature + payload mapping and driving a signed webhook through the real route; read raw webhook bytes via an encapsulated parser.

## Architecture
_(none yet — see [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md) for the full picture)_

## Glossary
_(canonical terms live in [`../../docs/glossary.md`](../../docs/glossary.md); add focused entries here only when a term needs more than a one-line definition)_
