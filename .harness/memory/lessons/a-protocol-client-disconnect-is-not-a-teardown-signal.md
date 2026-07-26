---
id: a-protocol-client-disconnect-is-not-a-teardown-signal
kind: lesson
title: A protocol client's close() is not a teardown signal — read the client, then build the reaper
links:
  - apps/mcp/src/http.ts
  - apps/mcp/tests/e2e/http.e2e.test.ts
  - apps/server/src/mcp-http.ts
  - docs/adr/0058-remote-mcp-http-transport.md
confidence: 0.9
created: 2026-07-26
---

**What happened:** F-055 put the MCP tools on a stateful HTTP transport — one `McpServer` + transport
per session, held in a `Map`. The obvious teardown story is "the client disconnects, we clean up."
Reading the SDK's *client* said otherwise: `close()` clears a timer, aborts a controller, and calls
`onclose` — it **sends nothing**. Only the explicit `terminateSession()` issues the `DELETE` the
server needs. So the *ordinary* case, an agent process exiting, strands a server and its transport
forever, and no amount of client-side politeness fixes it.

The same read produced three more facts no amount of reasoning would have: the transport needs
`parsedBody` or it calls `req.json()` on a stream the framework already drained and **hangs**;
`Protocol.connect` throws on transport reuse, which is what makes "stateless" secretly mean *a new
20-tool server per request*; and the SDK's own bearer middleware **rejects tokens without
`expiresAt`** — which this product issues.

**Why:** a session's lifetime is owned by whoever holds the memory, not by the peer. Anything that
depends on a remote party sending a goodbye is a leak with extra steps: processes get killed, networks
partition, and clients are under no obligation. "The client will tell us" is an assumption about
someone else's code, and library docs describe the happy path while the source describes the contract.

**How to apply:**

- For any server-side session/connection map, make the **idle sweep** the primary reaper and treat an
  explicit close as an optimisation. `lastSeenAt` per entry, a TTL, and a bounded cap so the map cannot
  grow without limit. **`unref()` the interval** or the process never exits.
- **Assert the leak in a test, not just the cleanup.** `expect(sessionCount).toBe(1)` after
  `client.close()` — then that the sweep clears it. A test that only proves the happy path would pass
  identically with no reaper at all, which is precisely the bug.
- Before designing against a protocol library, **read its client and its transport source** for the
  specific calls you depend on. Cite line numbers in the ADR so the next reader can re-check rather
  than re-derive. Every load-bearing claim in ADR-0058 came from `node_modules`, not from docs.
- Mounting a raw protocol handler behind a web framework has a fixed shortlist of collisions worth
  checking up front: **who parsed the body**, **whose headers survive a hijacked reply** (framework
  `reply.header()` is lost when the handler calls `writeHead`; `raw.setHeader` merges), and **what
  order shutdown runs in** (an open stream is not an "idle" connection, so closing the app first
  hangs). See [[authentication-is-not-authorization-on-a-shared-bus]] for the sibling case where the
  transport change, not the handler, was where the real decision lived.
