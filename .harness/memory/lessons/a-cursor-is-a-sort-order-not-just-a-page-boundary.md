---
id: a-cursor-is-a-sort-order-not-just-a-page-boundary
kind: lesson
title: A keyset cursor IS the sort order — "sortable columns + cursor pagination" is not a feature, it is a contradiction
links:
  - docs/adr/0051-audit-trail-is-chronological-no-column-sorting.md
  - apps/api/src/schemas/audit.ts
  - packages/config/src/audit/sqlite-audit-log.ts
  - apps/web/components/ui/data-table.tsx
confidence: 0.9
created: 2026-07-17
---

**What happened:** F-063's acceptance asked for a data table with **sortable columns** *and* **cursor
pagination**. Both are ordinary table features; together, on a keyset-paginated API, they are
mutually exclusive — and it took reading the adapters to see it.

A keyset cursor is a **position in an ordering**: `seq < cursor` is only a valid page boundary while
rows are ordered by `seq`. Sort by a different column and the cursor means nothing. So "sort by actor,
then page" needs a **compound keyset** over `(actor, seq)` and a composite cursor — a database
feature, not a UI toggle. The API's own doc comment had said so all along: *"Results are newest-first;
`cursor` paginates forward."*

**The tempting wrong answer, and why it is the worst option:** sort the loaded window client-side. It
is ten lines and it looks right. It also presents "sorted by actor" while showing **page 1 of 40** —
which on a compliance surface is the *exact* dishonesty the same feature was deleting ("more events
match — narrow the filters to see older entries"). A lie that ships as a feature is worse than the
bug it replaces, because it looks like progress.

**How to apply:**
- **When an acceptance names two capabilities, check they compose.** "Sortable + cursor-paginated",
  "live + reproducible", "complete + capped" — each pair has a real tension. Read the adapters, not
  the ticket.
- **Ask what the user actually needs.** "Sort by actor" and "sort by date" turned out to be **filters**
  wearing a sort's clothes: *"what did this actor do?"*, *"what happened Tuesday?"* A filter narrows
  the **whole** trail; a sort only reorders the page you happen to hold. The filter is the better
  answer *and* the buildable one.
- **Some data has an intrinsic order.** An audit trail is chronological by nature — `seq` *is* its
  order, and time-descending is the only ordering a compliance record has. Do not add sorting to
  something whose order is part of its meaning.
- **Record the tension as a durable fact.** It is not a shortcut, so it must not read like one, or the
  next person re-litigates it. ADR-0051 exists so that "why can't I sort the audit table?" has an
  answer with evidence in it.

**Corollary — `aria-rowcount={-1}` is not a cop-out, it is the same truth.** Cursor pagination means
the total is *genuinely unknown*: the page type is `{events, nextCursor?}` and no count exists in the
model, the schema, or either adapter. Announcing the **loaded** count would tell a screen reader "row
50 of 50" while `nextCursor` proves otherwise — the same lie, told to the users least able to detect
it. ARIA specifies `-1` for exactly this. Whenever pagination cannot know a total, the honest UI says
"showing N · more available", never "N of N".
