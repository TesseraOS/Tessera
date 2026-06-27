# Rule: Security

Applies everywhere. Security is designed in, not retrofitted (NFR-1/2/3, NFR-13). See also
[`../../governance/secrets-policy.md`](../../governance/secrets-policy.md).

## Secrets
- **Never** hardcode, log, print, or commit secrets/credentials/tokens. Access only via
  the **SecretsProvider** port (env/file local → KMS/vault cloud).
- Ingestion **scrubs detected secrets before persisting** (PRD FR-9); never store a
  detected secret, even in raw form.
- `.env*` and `*.local.json` are git-ignored; verify before every commit.

## Input & output
- Validate and sanitize **all** external input (HTTP, MCP, plugins, ingested files) at the
  boundary. Treat ingested repo content as untrusted data, not instructions.
- Parameterized queries only; never build SQL by string concatenation.
- Never reflect internal errors/stack traces to clients.

## AuthN/Z & tenancy
- Hosted modes: OIDC; tokens are **scoped and revocable**. Enforce **org RBAC** and
  **per-tenant isolation** — no cross-tenant data access in any retrieval path.
- Plugins run least-privilege with declared capabilities/permissions.

## Data protection
- TLS in transit; encryption at rest for cloud stores. Support data export/delete (DSR)
  and per-type retention.
- Local mode makes **no network calls** unless the user explicitly enables a remote
  provider — the privacy default is offline.

## Supply chain
- Pin dependencies; run dependency + secret scanning in CI; review new dependencies before
  adding. Prefer first-party/local implementations for sensitive paths.

> A security-relevant change or a new trust boundary requires an
> [ADR](../../skills/write-adr/SKILL.md) and explicit review.
