---
id: move-facts-to-the-server-not-formatting
kind: lesson
title: The parity pattern is for facts, not formatting — two implementations of a re-encoding cannot disagree about truth
links:
  - apps/web/lib/export/context-package.ts
  - apps/api/src/stats/core.ts
  - packages/config/src/sources/search-enrichment.ts
  - apps/mcp/src/explain.ts
confidence: 0.85
created: 2026-07-17
---

**What happened:** F-060 and F-061 both concluded "compute it once on the server so REST and MCP
cannot disagree" — `computeWorkspaceStats` behind a Fastify-free subpath, then `createEnrichedRetriever`
in the composition root. Both were right, and both were load-bearing enough to write into their ADRs.

F-062 needed a Markdown export of a Context Package. The pattern says: server-side, one
implementation, ADR-0036 parity. **Applying it would have been wrong**, and noticing why took longer
than it should have — the pattern had just been reinforced twice.

**The distinction:**

> The parity pattern applies when the server computes a **fact** the client would otherwise re-derive
> — and could re-derive *differently*. `computeWorkspaceStats` and a search `label` are facts: two
> implementations can **disagree about truth**, and then one of them is lying to somebody. Markdown is
> not a fact. It is a **re-formatting of data the caller already holds, byte for byte**. There is no
> truth to disagree about.

Concretely, for the export:
- **The agent already has the package.** `compile_context` returns the whole `ContextPackage`.
  Markdown would be a *lossier and fatter* encoding of what it already received — an agent asking for
  it would pay more tokens for less structure. ADR-0036 says the agent surface must be no less
  *capable*; it is not less capable, it is better served.
- **The consumer is a human's clipboard.** The Markdown exists so a person can paste a package into a
  chat box. That is presentation, and it belongs in the presentation layer.
- **A server export would have cost real things for no consumer**: an endpoint or `format` field →
  E-003 → an SDK regen → an MCP tool (breaking the exact-tool-set assertion) → and compile-envelope
  budget. All to serve nobody.
- **JSON download is `JSON.stringify(pkg)`** — literally the bytes the API just sent. A round-trip for
  it would be self-parody.

**The test to apply:** ask *"if the client and the server both implemented this, could they produce
answers that disagree about what is true?"*
- **Yes** → server-side, one implementation (a count, a label, a derived key, an entitlement).
- **No, only about style** → client-side (a serialization, a layout, a date format, a slug).

**Corollary — "reuse the existing thing" needs the same scrutiny.** `buildExplanation` (MCP) looked
like a package serializer to reuse. It is the *opposite*: its documented purpose is "provenance +
trace, **no fragment bodies**" — it strips the very text an agent-ready export exists to carry. And it
lives in `apps/mcp`, which `apps/web` cannot import. **Read what a candidate for reuse actually does
before planning around its name.**

**The meta-lesson:** a pattern that just paid off twice is the most dangerous kind, because applying
it feels like consistency rather than a decision. Both prior features had a *reason* — divergent
truth — and the reason, not the shape, is what transfers. When a plan reaches for a precedent, make it
restate the precedent's *justification* and check that it still holds; F-062's plan did exactly that
and the answer flipped.
