# Security Policy

Tessera ingests source code, commits, issues and chat history, and it holds compiled context and
memory on a user's behalf. A vulnerability here can expose a codebase, so please report one privately
and we will treat it accordingly.

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
[Report a vulnerability](https://github.com/TesseraOS/Tessera/security/advisories/new).

That channel is deliberate rather than an email address: it is private by default, it exists today,
and it does not depend on a mailbox that is not yet live. Dedicated security mailboxes arrive with
the operator-identity work ([F-069](.harness/state/feature_list.json)); this file is updated when they
do.

**Please do not** open a public issue, pull request, or discussion for a suspected vulnerability, and
please do not disclose it publicly before we have responded.

Helpful reports include: the version or commit, the deployment profile (Local, self-hosted, or
Managed Cloud), what an attacker gains, and the smallest reproduction you have. A proof of concept is
welcome; **do not** include real credentials, customer data, or private source code in it.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement that we received the report | **3 business days** |
| Initial assessment — severity, whether we can reproduce it | **10 business days** |
| Fix or documented mitigation for a confirmed **critical/high** issue | **90 days** from acknowledgement |
| Public advisory | With the fix, crediting you unless you prefer otherwise |

These are targets for a small team, stated so you know what silence means. If a deadline passes
without word from us, escalating publicly is reasonable — we would rather be held to this than have
you wait indefinitely.

## Scope

**In scope:** this repository and the packages published from it — the REST API and MCP surfaces,
the auth/tenancy and data-isolation model, the plugin host, the dashboard, the CLI, and the
deployment profiles.

Vulnerability classes we care about most, because they map to what Tessera actually guards:

- **Cross-tenant or cross-project data exposure** — anything that lets one tenant read another's
  context, memory, sources, audit trail, or usage.
- **Authentication or authorization bypass** on `/v1` or the MCP surface, including the remote MCP
  transport.
- **Secret disclosure** — credentials from config, the secrets provider, or logs.
- **Prompt or context injection** that causes an agent to exfiltrate context it was not entitled to.
- **Remote code execution**, including via a malicious plugin or an ingested repository.

**Out of scope:** findings against a deployment you do not own; denial of service by volume alone;
missing hardening headers with no demonstrated impact; results from automated scanners without a
working reproduction; social engineering; and vulnerabilities in third-party dependencies that are
already public — for those, please open a normal issue so we can bump the dependency.

Note that a **Local** deployment is single-user and zero-auth by design (`auth.mode: none`): "an
unauthenticated local process can call the API" is the documented behaviour of that profile, not a
vulnerability. Reports about the `token` or `oidc` modes, or about any network-reachable surface,
are firmly in scope.

## Supported versions

Tessera has **not had a first release yet** (see
[`.harness/state/progress.md`](.harness/state/progress.md)). Until `0.1.0` ships, the supported
version is **`main`**, and fixes land there.

Once releases exist, the latest minor line receives security fixes.

## What we already do

Verifiable in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), on every change:

- **Dependency vulnerabilities** — Trivy over `pnpm-lock.yaml` at CRITICAL/HIGH, failing the build
  ([ADR-0052](docs/adr/0052-dependency-audit-via-trivy-not-pnpm-audit.md) explains why not
  `pnpm audit`).
- **Secret scanning** — gitleaks across full history, not just the tip.
- **The verification gates** — typecheck, lint, tests, build, end-to-end and accessibility — must be
  green on every change ([`.harness/verification/gates.json`](.harness/verification/gates.json)).

Secrets never live in configuration: they are resolved through a `SecretsProvider`, and a test
asserts there is nowhere in the config schema to put one by accident. See
[`.harness/governance/secrets-policy.md`](.harness/governance/secrets-policy.md).

## Safe harbour

We will not pursue or support legal action against anyone who reports in good faith under this
policy, who avoids privacy violations and service degradation, and who does not access or modify data
beyond the minimum needed to demonstrate the issue.
