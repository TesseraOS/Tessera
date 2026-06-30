# @tessera/plugin-host

The Plugin SDK + host (F-013; FR-40/58; ARCHITECTURE §12). A **uniform envelope** over Tessera's
existing extension-point ports, plus a host that discovers, validates, and runs plugins with failure
isolation. First-party connectors/embeddings ship as plugins on the **same** contract as third
parties.

## SDK

A `Plugin<TConfig, TCapability>` is a `manifest` (id, `kind`, name, version, **Zod `configSchema`**)
+ `setup(config, ctx) → PluginInstance`. The `capability` is the **existing port** the plugin
provides — a `Connector`, `Embeddings`, `Retriever`, a storage port, etc. `PluginKind` enumerates the
five extension points (`connector` / `processor` / `ai-provider` / `storage-backend` /
`retrieval-strategy`).

## Host

```ts
import { createPluginHost, filesystemConnectorPlugin } from '@tessera/plugin-host';

const host = createPluginHost();
host.register(filesystemConnectorPlugin);
await host.load('tessera.connector.filesystem', { root: '.' }); // validates config, runs setup
await host.startAll();
const connector = host.capability('tessera.connector.filesystem');
```

- `register` (unique ids) · `load` (validate config → `setup`) · `start`/`stop`/`dispose` (+ `*All`)
  · `capability<T>` · `list({ kind })`.
- **Failure isolation (FR-58):** invalid config and setup/lifecycle errors mark the plugin `failed`
  (with the message) and **never throw out of the host** or stop others. Only an *unknown id* throws.

## First-party plugins (dogfooding)

`filesystemConnectorPlugin` (wraps the ingestion filesystem connector) and `fakeEmbeddingsPlugin` /
`transformersEmbeddingsPlugin` (wrap the AI embeddings) — they use the exact contract a third party
would. They live here so the host depends on `@tessera/ingestion`/`@tessera/ai` one-way (no cycle).

## Scope

Error isolation, not process/sandbox isolation (R0). A split `plugin-sdk`/`plugin-host` (so domain
packages can export their own plugins) and wiring the deployment profile (F-015) via the host are
follow-ups.
