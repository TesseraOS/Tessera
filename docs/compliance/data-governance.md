# Data governance — retention, data-subject rights, and encryption at rest

Operator guide for the compliance surface delivered by **F-047** and decided in
[ADR-0049](../adr/0049-data-governance-retention-dsr-mcp-audit.md). Covers **FR-15** (memory
retention/expiry), **FR-55** (audit of sensitive actions), and **NFR-13** (data-subject rights,
retention, encryption-at-rest posture).

Everything here is **tenant-scoped**: every operation acts on the caller's own tenant
([ADR-0033](../adr/0033-data-plane-tenant-isolation.md)), and the tenant is taken from the
authenticated principal — never from a request parameter. All routes below require the `admin:manage`
permission and are themselves recorded in the audit trail.

---

## 1. Memory retention (FR-15)

### Configuring a policy

Retention is **off by default** — no rules means nothing is ever pruned. Configure it under
`memory.retention.rules`; thresholds are authored in **days**:

```jsonc
{
  "memory": {
    "retention": {
      "rules": [
        // Catch-all: keep at most 5 superseded versions of anything.
        { "maxSupersededVersions": 5 },
        // Task notes are ephemeral: expire 30 days after their last edit.
        { "kind": "task", "maxAgeDays": 30 },
        // Scratch notes in one scope go sooner.
        { "kind": "task", "scope": "scratch", "maxAgeDays": 7 }
      ]
    }
  }
}
```

| Field | Effect |
|---|---|
| `kind` | Restrict the rule to one memory kind (omit ⇒ every kind). |
| `scope` | Restrict the rule to one scope (omit ⇒ every scope). |
| `maxAgeDays` | **Expiry** — delete the whole lineage once its *current* version is older than this. |
| `maxSupersededVersions` | **Compaction** — keep at most N superseded versions per lineage (newest kept). |
| `maxSupersededAgeDays` | **Compaction** — prune superseded versions older than this. |

**Rule selection:** the **most-specific matching rule wins** — `kind`+`scope` beats `kind`, which beats
`scope`, which beats a catch-all — and only that rule's thresholds apply. In the example above, a
`task` in scope `scratch` expires at 7 days and is *not* also subject to the catch-all's compaction.

**Age is measured from the current version**, so an actively-edited memory does not go stale.

### What retention does and does not do

- It **only deletes**: whole expired lineages, and already-superseded versions. It never edits a
  version and never touches the current version of a lineage it keeps — FR-12's never-silently-mutate
  contract is intact ([ADR-0049 §1](../adr/0049-data-governance-retention-dsr-mcp-audit.md)).
- Expiring a memory also removes it from the **retrieval corpus**, so it stops being searchable. There
  is no remanence.

### Running the pass

```bash
# The effective policy (audited as retention.read)
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/v1/retention

# Apply it to the calling tenant (audited as retention.manage)
curl -X POST -H "Authorization: Bearer $TOKEN" https://api.example.com/v1/retention/prune
# => { "expiredLineages": 3, "prunedVersions": 12 }
```

Or via the SDK: `client.getRetention()` / `client.pruneRetention()`.

> **Scheduling is not built in.** The prune route is the trigger; run it from your own scheduler (cron,
> a k8s CronJob, a timer) at whatever cadence your policy needs. This mirrors the audit trail's
> retention posture and is a documented seam, not an oversight.

> **The policy is config-driven and not runtime-mutable.** There is deliberately no `PUT /v1/retention`
> — config is the single source of truth for a destructive policy. Change config, redeploy, prune.

---

## 2. Data-subject rights (NFR-13)

### Export — right of access

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/v1/dsr/export > tenant-export.json
```

Returns a **complete** JSON bundle for the calling tenant (audited as `dsr.export`):

| Section | Contents |
|---|---|
| `memories` | **Every version** of every lineage — superseded versions included, not just current ones. |
| `graph` | The whole knowledge graph: all nodes and edges (unbounded — not the display-capped `/v1/graph` view). |
| `sources` | Every registered ingestion source. |
| `audit` | The tenant's complete audit trail, fully paged. |

SDK: `client.exportTenantData()`.

### Erasure — right to be forgotten

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" https://api.example.com/v1/dsr/delete
# => { "tenantId": "acme", "deletedAt": "...", "memories": 42,
#      "graph": { "nodes": 310, "edges": 118 }, "sources": 3 }
```

Erases the tenant's **data plane** (audited as `dsr.delete`):

- every memory lineage (all versions) — **and their retrieval-index entries**, so nothing remains
  searchable;
- the entire knowledge graph;
- every registered source.

SDK: `client.deleteTenantData()`.

> **The audit trail is retained.** This is deliberate
> ([ADR-0049 §2](../adr/0049-data-governance-retention-dsr-mcp-audit.md)): the trail is the compliance
> record *of the erasure* — the `dsr.delete` event is written into it — and by design
> (`AuditEvent`, NFR-7) it holds **no content**, only who did what, when, with what outcome. Deleting
> it would destroy the proof the erasure happened while removing no personal data. If your
> jurisdiction requires the trail to go too, that is a config-gated seam — raise it before relying on
> it.

> **Erasure is irreversible and immediate.** There is no soft-delete or grace period. Take an export
> first if you need one; the two operations are independent.

### Operator checklist for a DSR request

1. Verify the requester is entitled to act for the tenant (out of band — Tessera authorizes on
   `admin:manage` within the tenant, it does not adjudicate entitlement).
2. `GET /v1/dsr/export` → deliver the bundle. It is a plain JSON file; transmit it over a channel
   appropriate to its sensitivity.
3. If erasure is requested, `POST /v1/dsr/delete`.
4. Evidence the action: `GET /v1/audit?action=dsr.export` / `?action=dsr.delete` shows who ran it and
   when.

---

## 3. Audit coverage (FR-55)

The trail records **both surfaces** on one taxonomy — a REST `POST /v1/memory` and an agent's MCP
`capture_memory` are both `memory.write`, so a single query answers "who wrote memories last month"
regardless of how they connected. MCP events carry `metadata.surface = "mcp"` when you need to tell
them apart.

MCP records the **authorization decision**: `success` when a tool call is authorized, `denied` on a
permission or quota refusal. Unauthenticated calls are not recorded — there is no identity to attribute
them to, the same rule the REST recorder applies to 401s.

Audit-trail retention is separate from memory retention and is configured under `audit.retention`
(`maxAgeDays` / `maxEntries`).

---

## 4. Encryption at rest — posture

**Tessera does not implement application-level encryption at rest.** It is configured at the deployment
layer, which is the layer that owns the disk and the keys. NFR-13 requires the posture be documented;
this is it.

| Deployment | Data at rest | How to encrypt |
|---|---|---|
| **Local / self-hosted (SQLite)** | `.tessera/tessera.db`, `.tessera/vectors.db`, blob corpus under `.tessera/blobs` | OS/volume full-disk encryption (LUKS, BitLocker, FileVault) — the default recommendation. For per-file encryption, [SQLCipher](https://www.zetetic.net/sqlcipher/) can back the SQLite driver; Tessera does not ship or configure it. |
| **Cloud / managed (Postgres + pgvector)** | The database volume and its backups | Encrypted volumes (EBS/PD encryption) and/or the engine's TDE. Enable backup encryption too — an unencrypted snapshot silently undoes the rest. |
| **Blob corpus (object storage)** | Ingested fragments | Server-side encryption (SSE-KMS or equivalent) on the bucket. |

### Key handling

- Keys **never** live in the repository, in config files under version control, or in `TESSERA_*`
  values committed anywhere.
- Secrets reach the runtime through the existing **`SecretsProvider`** port (`env` or `file` locally; a
  KMS/vault adapter is the cloud seam). See
  [ADR-0018](../adr/0018-config-loader-and-local-profile.md).
- Rotation is the deployment's responsibility and follows your KMS's practice; Tessera holds no
  long-lived key material of its own.

### What Tessera does guarantee

- **Secrets are scrubbed before persistence** — ingestion redaction is terminal (F-006), so credentials
  in source content never reach the corpus.
- **The audit trail holds no content** — only actor, action, target ref, outcome, timestamp (NFR-7).
- **Logs never carry secrets or raw ingested content** — the Pino logger redacts both (F-016).
- **Tenant isolation is adapter-enforced**, not filtered at the edge
  ([ADR-0033](../adr/0033-data-plane-tenant-isolation.md)).

---

## References

- [ADR-0049](../adr/0049-data-governance-retention-dsr-mcp-audit.md) — the decisions behind this page.
- [ADR-0034](../adr/0034-audit-trail-and-governance.md) — the audit trail.
- [ADR-0033](../adr/0033-data-plane-tenant-isolation.md) — tenant isolation.
- [ADR-0003](../adr/0003-local-first-cloud-ready-ports-and-adapters.md) — deployment profiles and data
  residency.
- Requirements: FR-12, FR-15, FR-55, NFR-7, NFR-13 — [`docs/PRD.md`](../PRD.md).
