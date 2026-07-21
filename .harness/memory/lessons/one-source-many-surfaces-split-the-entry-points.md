---
id: one-source-many-surfaces-split-the-entry-points
kind: lesson
title: When one source feeds several surfaces, split the entry points so the expensive payload is unreachable from the cheap path — and verify vendor paths, never infer them
links:
  - packages/skills/src/index.ts
  - packages/skills/src/content.ts
  - packages/skills/src/types.ts
  - .harness/state/effects.json
confidence: 0.9
created: 2026-07-21
---

**Context (F-054):** one registry (`@tessera/skills`) had to feed three surfaces — a marketing
catalog, a CLI, and two MCP tools — where a *listing* must stay token-lean (NFR-4) but a *fetch*
must return the whole document.

**What worked, and is reusable:**

**1. Split the package entry points, don't write a rule.** Manifests export from `.`, bodies from
`./content`. The listing handlers import the root, so shipping a body from a listing is not
"something review should catch" — it is unreachable through the module graph. A constraint you can
express as a dependency edge beats one you express as a convention.

**2. Make the derived artifact committed and byte-gated.** Reading markdown at runtime would have
meant filesystem access from a Next static build and non-`dist` files in a published tarball.
Compiling the sources into committed generated modules gave every consumer a plain `import` and zero
runtime dependencies; the staleness cost is paid by a regenerate-and-byte-compare test in the normal
`test` gate. **Prove the gate has teeth before trusting it** — perturb a source, watch it redden with
the regenerate instruction, revert.

**3. Let the derived data be the schema.** `get_skill`'s input is `z.enum(SKILL_NAMES)`, so
`tools/list` *publishes* the catalog: an agent can fetch without discovering first, and a typo is
refused at the boundary by a message naming every valid option. The cost — adding an item changes a
downstream generated artifact — is the honesty coupling, not a bug.

**4. A cross-check test belongs where both sides are visible.** The registry must not depend on the
MCP server, so "every tool a skill teaches is a real tool" cannot live in the registry package. It
lives in `apps/mcp`, the one place that can see both. When a validation spans two packages that must
not depend on each other, put it in the consumer.

**Verify vendor-facing paths against the vendor's own docs.** The plan proposed per-agent skills
directories sourced from third-party blog posts. Checking the primary docs changed the answer twice:
`.agents/skills` is the **cross-agent standard** (Cursor and Codex scan it; Claude Code does not),
and a per-skill "compatible agents" list turned out to be fabricated precision — identical for every
skill and unverifiable per skill, so it was dropped. **A wrong skills path fails silently** (the agent
simply never loads the file), which is exactly the class of error no test catches.

**Reuse the lowest existing permission for public content.** New RBAC entries ripple through the
catalog → `/v1/rbac` → OpenAPI → generated SDK → the dashboard token UI. For content served
unauthenticated elsewhere, minting `skills:read` would have added that blast radius *and* left a
`search:read` token unable to read a public document. Argue the reuse inline where the map lives.
