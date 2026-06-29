# @tessera/config

Deployment profiles, the validated config loader, and the secrets port (F-015; ARCHITECTURE §16/§132;
FR-50/FR-53). This is the **composition root**: it wires the storage/AI adapters into the
`ApiServices` the REST (F-011) and MCP (F-012) surfaces consume.

## Config

`loadConfig(env?, overrides?)` validates a config that defaults sensibly and is overridable by
`TESSERA_*` environment variables (explicit `overrides` win, merged per section). Sections:
`storage` (sqlite/vector paths, blob root), `embeddings` (`transformers` | `ollama` | `fake`, model,
dimension), `budgets`, `secrets`. Invalid input throws a typed `ValidationError` at startup.

```ts
import { loadConfig, createLocalRuntime } from '@tessera/config';

const config = loadConfig(); // TESSERA_* env + defaults
const runtime = await createLocalRuntime(config);
// runtime.services: ApiServices  →  buildServer(runtime.services) / buildMcpServer(runtime.services)
// ...
await runtime.close();
```

## Local profile

`createLocalRuntime(config)` wires the Local profile — **SQLite + sqlite-vec + filesystem + in-process
queue + Transformers.js**, zero external services or keys — and composes the domain services
(F-007…F-010) into an `ApiServices`. The embedding dimension flows from the provider to the vector
store, so they always match. Returns a `Runtime` with the stores, embeddings, the keyword retriever
(for indexing), a readiness probe, and `close()`. Non-`local` profiles throw until F-023.

The compiler's corpus seam is a **blob-backed `FragmentSource`**: a document `ref` maps to a blob
holding JSON `{ kind, text, metadata? }` (`createBlobFragmentSource` / `putFragment`). Ingestion's
persistent DocumentSink writes these (downstream).

## Secrets

`SecretsProvider` port (`{ get, require }`). `createSecretsProvider(config.secrets, env?)` selects the
**env** adapter (prefixed `process.env`) or the **file** adapter (a JSON map). `require` fails fast,
never echoing the value. Cloud profiles implement the same port over KMS/vault.

## Tests

- **Unit:** schema defaults/validation + `TESSERA_*` overrides; the env + file secrets adapters.
- **Integration:** `createLocalRuntime` over `:memory:` SQLite + a temp blob dir + the **fake**
  embeddings provider, exercising memory/graph/search/compile for real (offline). The real
  Transformers.js provider is covered by an env-guarded test (`TESSERA_TEST_TRANSFORMERS=1`).
