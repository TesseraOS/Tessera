---
id: zod-exactoptional-bridge
kind: lesson
title: Bridge Zod .optional() to exactOptionalPropertyTypes when mapping to domain types
links:
  - packages/memory/src/service/memory-service.ts
  - packages/memory/src/validation.ts
  - tsconfig.base.json
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-007 introduced Zod. The workspace tsconfig sets `exactOptionalPropertyTypes:
true`, so a domain field `source?: string` means *absent-or-string*, **not** `string | undefined`.
But Zod's `.optional()` infers `source?: string | undefined`. Passing a Zod-parsed object straight
into a function expecting the domain shape failed typecheck (TS2379: `string | undefined` not
assignable to `string`).

**Why:** the two notions of "optional" differ. Hand-written domain types use exact-optional
(cleaner: you can't explicitly set a key to `undefined`); Zod outputs the `| undefined` form. They
meet at the boundary where validated input becomes a domain object.

**How to apply:** keep domain types hand-written and exact-optional; at the seam, use a small mapper
that (a) **accepts** the Zod shape — type its parameter with `| undefined` optionals, e.g.
`{ source?: string | undefined; ... }` — and (b) **builds** the domain object by conditionally
adding only defined keys (`if (x !== undefined) out.x = x`). Build the target with a mapped type
`{ -readonly [K in keyof T]?: T[K] }` then return it as `T`. Do **not** loosen the domain type or
the tsconfig to make the error go away (engineering/typescript rules). See [[engineering-standards]].
