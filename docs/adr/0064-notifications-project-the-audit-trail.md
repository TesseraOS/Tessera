# ADR-0064: Notifications are a projection of the audit trail; the store holds only what cannot be derived

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Project lead, Claude
- **Tags:** api, notifications, audit, mcp, dashboard, data-governance

## Context

F-065's acceptance was written before F-089. It asks for a "NotificationStore port with in-memory
and persistent SQLite adapters" holding "typed kinds … per-user read/unread state, retention prune",
and in the same clause requires that notifications be "produced from the SAME domain events that
feed SSE — **never a second event taxonomy**".

Ten days earlier, F-089 answered the same question for the dashboard feed and the bell and reached a
different conclusion: the workspace already has a persisted, tenant-scoped, retention-pruned record
of what happened — **the audit trail** — so the feed reads that rather than accumulating a parallel
history. F-089 then rewrote F-065's own `notes` to say the feature "shrinks to what genuinely needs a
server store: notification preferences, CROSS-DEVICE read state keyed `{tenantId, principalId}`, the
agent-readable surface, and `occurredAt` on wire events".

The two readings build materially different systems, so it was escalated rather than reinterpreted
quietly.

A second problem sat underneath: since **F-081** a scan runs *after* the request is answered (202),
so the `source.manage` row the boundary records means "a scan was started". Whether it then finished
or died was recorded nowhere durable. `scan.failed` — the kind a notification centre most obviously
exists for — was therefore not derivable from anything.

## Decision

### 1. A notification is a typed, severity-tagged **projection** of the audit trail

There is no second store of events. `apps/api/src/notifications/project.ts` reads the trail
(tenant-scoped by the caller, ADR-0033), maps each audited action to at most one notification kind,
and joins the result with this principal's read state and preferences.

This is what acceptance clause 1's own words ask for. A parallel notification table *would be* the
second taxonomy it forbids: the same facts, recorded twice, ageing out under two retention policies,
and diverging the first time one write path forgot the other.

Only **successful** events project — a denied action is a security signal for the admin trail, the
same narrowing `/v1/stats/activity/recent` already makes.

### 2. The `NotificationStore` persists **only** read state and preferences

Keyed `{tenantId, principalId}`. Both are things the trail cannot hold: it is append-only, and "have
I seen this?" / "do I want to be told?" are per person, not per event.

Read state moved here from F-089's `localStorage`, which is the concrete reason this feature outlived
that one: marks kept in one browser are not read state, they are that browser's opinion of it. A
badge cleared on a laptop stayed lit on a phone.

In-memory (reference) and SQLite **and Postgres** adapters run one shared conformance suite, reachable
across packages on the `@tessera/api/conformance` subpath. The Postgres twin is required from the
self-hosted profile rather than optional, for the reason `ProfileAdapters.usageStore` already states:
an optional member is how a store ends up SQLite-only.

### 3. Background scan outcomes gain audit rows, so `scan.failed` is derivable

Two new actions — `source.scan.completed` and `source.scan.failed` — written by the composition
root's ingestion→SSE bridge and attributed to the principal that started the scan (threaded through
`ScanOptions.actor`; `PrincipalKind` followed `TenantId` into `@tessera/core` so ingestion can name a
principal without depending on `@tessera/api`).

**Two actions rather than one action with a failed outcome**, because `AuditOutcome` is
`success | denied`: it answers "was this permitted", and every existing consumer reads it that way.
Widening it is a real gap — `recordAudit` also maps a 500 to `denied` — but a separate change with
its own blast radius (see Follow-ups).

**An unattributed scan records nothing** rather than inventing a system actor. The trail's whole
contract is who-did-what; a `system` principal would let any producer write rows nobody can explain.

### 4. The kind taxonomy is exactly what has a producer

`memory.captured`, `scan.completed`, `scan.failed`, `token.changed`, `plan.changed`.

- **`system.alert` is not built.** Nothing emits it, and a preference toggle that can never fire is a
  promise the product does not keep. It arrives with its producer.
- **`token.created`/`token.revoked` collapse to one `token.changed`.** The trail records a single
  `token.manage` action for both. The dashboard *presentation* distinguishes them by route pattern,
  but a kind is a contract — preferences key off it, agents filter on it — so it must derive from
  what the recorder guarantees, not from a URL shape a future route split could silently flip.

Every other audited action projects to **no** notification. A notification interrupts someone; the
bar is "would a reasonable person want to be told?", not "did something happen".

### 5. Scope is tenant-wide; only read state is per principal

A projected notification belongs to the workspace (the bell has shown tenant activity since F-060),
so "recipient scoping" is read as *tenant* scoping — a shape the trail can actually express, since it
records one actor rather than an audience. Two people in one workspace see the same notifications and
keep independent read marks. Stated here so the narrower reading is a decision, not an omission.

### 6. Authorization splits on what a route can affect

Reads require `stats:read` — the member-visible view of workspace activity `/v1/stats/activity/recent`
already serves; viewer upward holds it. Read marks and preference writes require **authentication
only**: they are self-scoped and cannot touch another principal or tenant, the same posture as
`GET /v1/me`. Requiring a write permission there would leave a viewer able to see a badge and never
clear it.

**Reads are not audited** (a row per page load would flood the trail they project — the `/v1/stats`
posture). **Preference writes are** (`notification.manage`): muting token-change alerts suppresses a
security signal, and "who did that?" must be answerable.

The MCP tool is audited as `notification.read` rather than borrowing an existing read the way
`get_stats` does — `audit.read` is the admin trail-access signal a compliance reader watches, and
recording an agent's bell fetch as that would drown it. The two surfaces differ here deliberately: a
rendering client polls, an agent asks.

### 7. The API sends kinds, never prose

No rendered message text on the wire. The dashboard turns a kind into a sentence through its i18n
catalog (so it can be translated) and an agent reads the kind directly (so it stays token-lean,
NFR-4). An English sentence in the response would defeat both.

### 8. `occurredAt` is stamped in `sseFrame`

One place — the same argument that put the `tenantId` strip there: no producer can forget it and no
two can disagree about the format. The client was substituting its own clock for live rows while
every other timestamp on screen came from the API, so a skewed browser put them in the wrong order.

### 9. DSR erasure purges notification state

The opposite call to the audit trail's, and for the reason that distinguishes them: the trail is
retained because it is the compliance record *of* the erasure (ADR-0049), while read marks are pure
convenience keyed by the very principal ids the request is about.

## Consequences

- **`AUDIT_ACTIONS` grew by four**, which ripples through both adapters' typed columns, the Zod enum,
  OpenAPI, the regenerated SDK, `AUDIT_ACTION_LABELS` (an exhaustive `Record`, so a compile error
  until updated), the CSV export and `describeEvent`.
- `source.scan.*` do not end in `.read`, so they join `ACTIVITY_ACTIONS`: **a scan now shows as two
  points on the Overview chart** (started, finished) rather than one. Additive and honest.
- **Retiring `lib/store/notifications` discards per-device marks**, so users see previously-read rows
  as unread once. Accepted: the server becomes the source of truth.
- `unreadOnly` filters *after* the trail query, because read state lives in a different store and
  joining them at the database would couple the two. A page can therefore be shorter than `limit`
  while `nextCursor` still points at more — stated in the OpenAPI description, and clients must page
  on the cursor rather than on length.
- `unreadCount` is bounded to the newest `NOTIFICATION_UNREAD_WINDOW` (100) notifications. A count
  that is exact until the day it is slow is worse than a bounded one that says so.
- Two trail queries per list request (the page and the badge). Both are indexed on
  `(tenant_id, action)` and bounded.

## Follow-ups

- **`AuditOutcome` cannot express "this ran and failed".** `recordAudit` maps a 500 to `denied`,
  which is misleading for a server error. Worked around here with two distinct actions; the
  underlying gap deserves its own feature.
- **No `warning` colour token exists** in the design system, so `warning`-severity notifications are
  untinted and lean on their icon (which WCAG 1.4.1 requires regardless). Add the token before any
  surface needs warning to shout.

## Alternatives considered

- **Persist a notification row per SSE domain event** (the literal acceptance). Rejected: a second
  record of the same facts, which F-089 explicitly decided against and which clause 1 of the same
  acceptance forbids in its own words.
- **A hybrid** — project trail-backed kinds, persist only the SSE-only ones. Rejected: paginating a
  union of two time-ordered sources needs a composite cursor, and the merge is a bug farm for a
  distinction users cannot see. Recording the scan outcome in the trail removes the need entirely.
- **A `system` principal kind** for background work. Rejected: it makes unattributable audit rows
  possible for every producer, to save threading one optional field.
