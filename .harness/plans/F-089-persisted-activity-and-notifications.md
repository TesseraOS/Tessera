# Plan: F-089 Recent activity & notifications — persisted, limited, per-message read state

- **Feature:** F-089 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-55, FR-49, NFR-7
- **Service / package:** apps/api (+ @tessera/config, @tessera/sdk, apps/web)
- **Author:** Claude (Fable 5) · **Date:** 2026-07-18

## Intent

User items 4, 5, 6, 9 (2026-07-18 report): the Overview feed is always empty after a reload, the
bell forgets everything on reload, and the report asks the question directly: *"Why are we showing
recent activity and notifications for a session? Shouldn't we show actual persisted data like all
other data? I would say let's persist and not use session here, and limit the data — but think and
decide for yourself."*

## The decision (item 9), reasoned

The F-060 store is in-memory **by design**, with F-065 (full notification service) as the stated
successor. But the dashboard already *has* a persisted, tenant-scoped, pruned, non-sensitive record
of workspace activity: **the audit trail** — the same trail the activity chart aggregates (F-084).
Deciding:

1. **The feed and the bell read from the trail.** No new store, no new write path, no fabricated
   history — the same system-of-record posture as every other surface (ADR-0022). "Recent activity"
   becomes exactly that: the last N persisted work actions, alive via the stream.
2. **Limited at the server**: default 20, max 50 — the trail is already retention-pruned; the
   endpoint adds a hard cap, not a new policy.
3. **Read state is per-message and survives reload, per device.** The trail is append-only — read
   marks do not belong in it, and a *cross-device* read state needs the F-065 server store. Until
   then: a persisted client store (localStorage) keyed by `tenantId:principalId`, wiped on sign-out
   (the same shared-machine bleed `clear()` already guards; what persists is opaque event ids +
   timestamps, never content — the recent-compiles objection does not apply to marks).
4. **F-065 stays open** and shrinks to what genuinely needs a server store: preferences, cross-device
   read state, agent-readable surface, `occurredAt` on wire events. Its notes get updated.

Item 6 ("the session shouldn't change on refresh") is this same defect seen from the side: the only
"session" a refresh was resetting *was* this in-memory scoping (the auth cookie already survives
reload). With the trail as the source, no user-visible surface is session-scoped any more, and all
"this session" copy goes.

## Server

- **Port:** `AuditQuery` gains `actions?: readonly AuditAction[]` (multi-action filter), honoured by
  both adapters (in-memory + SQLite `inArray`), pinned by the shared conformance suite + focused
  SQLite tests (F-063 precedent; F-078 unchanged).
- **Endpoint:** `GET /v1/stats/activity/recent?limit=` under **`stats:read`** (member/viewer hold
  it) — the trail's *query* surface stays `admin:manage`; this is a deliberately narrower view:
  - **success only** (denied attempts are security signal — admin's, not the feed's);
  - **work actions only, minus `search`**: the chart counts search as engagement, but a feed row per
    debounced search is noise that would bury real changes — documented rule, one constant;
  - **non-sensitive fields only**: `id, action, target?, actor {principalId, kind}, at` — targets
    are ids/route patterns by the recorder's own guarantee (NFR-7).
  - Not audited (same posture as `/v1/stats`: an aggregate read per page load would flood the trail
    it reads). **No MCP tool** (ADR-0053 posture — agents have `get_stats`).
- OpenAPI + SDK regenerated in-change.

## Web

- `useRecentActivity(limit)` — plain query; a single app-level `ActivitySync` (replacing
  `FeedIngest`) owns SSE→debounced-invalidation, so header bell + Overview feed share one refetch
  path; mutations that write the trail without emitting SSE (compile, token/retention/audit-export)
  invalidate it in their `onSuccess`.
- `lib/store/notifications.ts` becomes the **read-state** store (persisted): per-identity
  `{ watermark, readIds }`; unread = entries newer than watermark and not individually read; capped
  and pruned; wiped on sign-out.
- **Feed:** renders persisted entries (action → icon + prose via a mapping shared with the audit
  labels; target rendered when meaningful). Empty state = honest "no recorded activity yet", no
  session language.
- **Bell:** unread dot per row, click-row = mark read, "Mark all as read"; opening no longer
  auto-clears (per-message semantics). Badge counts real unread.
- Timeline keeps its live enrichment (labelled `live`) — unchanged.

## Verification

- API: conformance + SQLite tests for `actions`; route e2e (limit clamp, permission, success-only,
  exclusion of reads/search).
- Web: read-state math unit tests; feed/bell tests against server-fed entries; home e2e updated
  (persisted feed + badge honesty). Full gates both services.

## Effects

- E-003 (REST contract: new route), E-020 (audit port + adapters + conformance).
