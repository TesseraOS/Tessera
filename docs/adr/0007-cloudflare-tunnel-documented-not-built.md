# ADR-0007: Cloudflare Tunnel — documented, not built

- **Status:** Accepted
- **Date:** 2026-06-27 (ratified; originally agreed 2026-06-25)
- **Deciders:** Project lead, Claude
- **Tags:** deployment, scope

## Context

An open question was whether to build first-class support for exposing a locally-running
Tessera instance over HTTPS via Cloudflare Tunnel (`cloudflared`) — e.g. to share a
local instance or reach it from a hosted agent. The capability is useful, but the market
for "expose localhost over a tunnel" is **saturated and commoditized** (`cloudflared`,
ngrok, tailscale funnel, etc.), and none of it is differentiating for a Context & Memory
OS.

## Decision

We will **not build** tunneling into the product. Instead we will **document**
`cloudflared` (and equivalents) as an **optional self-host recipe** in the deployment
docs: bring your own tunnel, point it at the Tessera HTTP port. Tessera stays
tunnel-agnostic — it just needs to be reachable on a port.

## Consequences

### Positive
- Zero engineering and maintenance burden for a non-differentiating feature.
- Users keep full choice of tunnel/ingress technology.

### Negative / Costs
- Slightly more setup for a user who wants remote access (they run their own tunnel).

### Neutral / Follow-ups
- Add a "remote access" how-to under deployment docs during the self-host milestone.

## Alternatives considered

- **Build native tunnel integration** — duplicates commodity tooling, adds support
  surface, distracts from the core. Rejected.

## References

- `docs/roadmap.md` (self-host milestone), `docs/PRD.md` (out-of-scope list).
