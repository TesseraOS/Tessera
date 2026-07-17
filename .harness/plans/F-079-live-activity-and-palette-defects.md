# Plan: F-079 Dashboard defect sweep — live activity dropped off-Overview + command palette crash

- **Feature:** F-079 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38 (live updates), FR-49 (UX baseline)
- **Service / package:** apps/web
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

Two user-reported defects, both real and both root-caused to specific lines:

1. **Live activity never arrives (user item #4).** After registering and scanning a source,
   the Overview feed and the notifications bell stay empty. Reported as intermittent; it is
   in fact deterministic.
2. **Command palette throws (user item #17).**
   `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.

Done means: a scan triggered from `/sources` shows up in the bell immediately and in the
Overview feed on arrival, and no keydown can crash the palette.

## Root causes (verified, not hypothesised)

### #4 — the ingest subscription is mounted on one route

[`lib/api/events.tsx`](../../apps/web/lib/api/events.ts) is correct: `EventsProvider` owns a
single `EventSource` app-wide and fans out to subscribers. The socket **is** connected on
`/sources`.

The defect is one layer up. `useFeedIngest()` — the *only* code that pushes stream events into
the `useNotifications` store — is called exclusively in
[`components/dashboard.tsx:37`](../../apps/web/components/dashboard.tsx), and `Dashboard`
renders only at `/` ([`app/page.tsx`](../../apps/web/app/page.tsx)).

So on `/sources` (where scanning is triggered) there are **zero subscribers** for
`source.scan.*` / `document.*`. `EventsProvider.subscribe` fans out to an empty handler set;
the frames are parsed and dropped. Nothing writes to the store, so the bell never increments.
Navigating back to Overview mounts the ingest *after* the events have passed — the store is
empty and the feed renders "No activity this session".

The comment at `dashboard.tsx:35` ("Mount once — the bell reads the same entries") states the
right intent; it just picked a mount point that only exists on one route. The bell renders in
[`app-header.tsx`](../../apps/web/components/app-header.tsx) on **every** route, but only
*reads* the store — hence a global consumer fed by a route-local producer.

"Sometimes" in the report = the cases where the user happened to be sitting on Overview while a
scan completed (e.g. `autoScanOnRegister`).

### #17 — `event.key` is not always a string

[`command-palette.tsx:34`](../../apps/web/components/command-palette.tsx) does
`event.key.toLowerCase()`. `KeyboardEvent.key` is `undefined` for keydown events synthesised by
browser autofill, some password managers, and IME composition. The handler is bound to
`document`, so any such event anywhere on the page throws.

## Approach

Reuse the existing provider seam; no new architecture.

1. **Increment 1 (#17, isolated):** guard the key read in `command-palette.tsx`. Compare against
   a typed check rather than optional-chaining into a silent no-op, so a genuinely missing `key`
   is ignored instead of crashing. Also skip while `event.isComposing` — an IME "k" is text
   input, not a shortcut.
2. **Increment 2 (#4):** move the `useFeedIngest()` call out of `Dashboard` and into the
   app-wide client boundary that already wraps every authenticated route
   ([`app-shell.tsx`](../../apps/web/components/app-shell.tsx)), so the producer's lifetime
   matches the consumer's (the bell). `Dashboard` keeps rendering `<ActivityFeed />`; it no
   longer owns the ingest. The single-owner invariant the original comment wanted is preserved
   — it just moves up to where it is actually true.
3. **Increment 3:** regression tests that fail against today's code.

## Files to touch

- `apps/web/components/command-palette.tsx` — guard `event.key`; ignore IME composition.
- `apps/web/components/app-shell.tsx` — call `useFeedIngest()` once, app-wide.
- `apps/web/components/dashboard.tsx` — drop the route-local `useFeedIngest()` call + stale comment.
- `apps/web/components/activity-feed.tsx` — update the `useFeedIngest` doc to state the new mount contract.
- `apps/web/components/command-palette.test.tsx` — keydown with `key: undefined` must not throw.
- `apps/web/components/app-shell.test.tsx` (new if absent) — events received while off-Overview land in the store.

## Anticipated effects

- **No API/contract change.** Client-only; the SSE wire shape, `ApiEventMap`, and the events
  route are untouched. Nothing in `effects.json` is invalidated by construction.
- `useFeedIngest`'s **mount contract changes** (Overview-root → app-shell). It is exported from
  `activity-feed.tsx`; `dashboard.tsx` is its only caller today (verified by grep), so the blast
  radius is those two files. The risk on the other side is *double* ingest (duplicate feed
  entries) if a future caller re-mounts it — the doc comment must name the owner explicitly.
- Feed volume on the bell rises: previously the bell only ever counted events observed while on
  Overview. Post-fix it counts everything in the session, which is the intended F-060 behaviour
  and is already bounded by `FEED_LIMIT = 50`.

## Test plan

- **Unit (`command-palette.test.tsx`):** dispatch `keydown` with `key` absent → no throw, palette
  stays closed; `key: 'k'` + `ctrlKey` → toggles; `isComposing: true` + `key: 'k'` → no toggle.
- **Unit (`app-shell.test.tsx`):** render the shell on a non-Overview route with a stubbed
  events provider, emit `source.scan.completed`, assert `useNotifications.getState().entries`
  has the entry and `unread === 1`. This test fails on `main` — that is the point.
- **Regression:** existing `activity-feed.test.tsx` (`describeEntry`/`relativeTime`) must stay green;
  they are pure and untouched.

## Verification

Per [verification protocol](../protocols/verification.md), gates for apps/web:
`typecheck`, `lint`, `format`, `test`, `build`. Evidence: command output captured in
`progress.md`. Manual confirmation in the browser preview: register + scan a source **from
`/sources`**, assert the bell increments without navigating — the exact path that fails today.

## Risks / open questions

- **Double-ingest regression** is the one real risk (duplicate entries if both mount points
  survive). Mitigated by deleting the `Dashboard` call in the same increment and asserting a
  single subscription in test.
- `app-shell.tsx` must already be a client component for the hook to be legal — confirm before
  editing; if it is a server component, mount the ingest in the nearest existing client boundary
  (`providers.tsx`) instead, inside `EventsProvider` and `SessionProvider`.
- No ADR needed: this restores documented intent (F-060/FR-38), it does not deviate from it.
