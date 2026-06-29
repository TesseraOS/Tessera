# @tessera/server

Runnable entrypoints that boot the Tessera engine (F-032). This app is the thin glue deferred from
F-011/F-012/F-015 (ADR-0018): it loads config, wires the Local profile (`@tessera/config`), and
serves the two surfaces. It depends on `config` + `api` + `mcp` and **nothing depends on it**, so the
dependency graph stays acyclic.

## Bins

| Bin | Serves |
|-----|--------|
| `tessera-api` | the REST `/v1` API (F-011) over HTTP (`HOST`/`PORT`, default `127.0.0.1:3000`) |
| `tessera-mcp` | the MCP tools (F-012) over stdio — what agent clients launch |

```bash
pnpm --filter @tessera/server build
node dist/bin/api.js     # or: pnpm --filter @tessera/server start
node dist/bin/mcp.js     # stdio MCP server
```

Configuration is the standard `TESSERA_*` env surface (`@tessera/config`); the first run with the
default `transformers` provider downloads the embedding model once. Both bins shut down gracefully on
`SIGINT`/`SIGTERM` (close the server, then the runtime).

## API

`createServerRuntime(opts?)` → `Runtime`; `startApiServer(opts?)` → an HTTP handle (`{ app, url,
close }`); `startMcpServer(opts?)` → a stdio handle. Tests boot the real Local profile with the
`fake` embeddings provider over `:memory:` storage — the REST test talks to it over an ephemeral
HTTP port.
