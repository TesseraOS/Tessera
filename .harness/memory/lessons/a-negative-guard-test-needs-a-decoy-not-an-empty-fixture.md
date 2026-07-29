---
id: a-negative-guard-test-needs-a-decoy-not-an-empty-fixture
kind: lesson
title: A test that asserts "you must NOT see X" proves nothing unless the fixture would otherwise show X
links:
  - apps/api/tests/e2e/fragments.e2e.test.ts
  - apps/api/src/routes/v1/fragments.ts
  - apps/api/src/projects/selection.ts
confidence: 0.95
created: 2026-07-29
---

**What happened:** F-075's headline acceptance clause is "tenant A presenting tenant B's ref gets
404". The e2e asserted exactly that and passed. Then the route's `.forTenant(...).forProject(...)`
scoping was **deleted as a mutation check — and the test stayed green.**

The fixture seeded content only under `acme/default`. With scoping removed, the lookup fell to the
unscoped base view (`default/default`), which was **empty**, so it 404ed anyway. The test asserted
the right *outcome* through the wrong *cause*, and would have gone on passing after the isolation it
guards was removed.

**Why this is a whole class, not one slip:** a negative assertion (`expect(404)`, `not.toContain`,
`toBeUndefined`) is satisfied by *any* path that produces nothing — including the code under test
never running, a fixture being empty, a header being rejected upstream, or a name simply not
existing. Only a positive control distinguishes "the guard worked" from "there was nothing there".
This is [[a-guard-test-must-uniquely-decide-the-answer]] seen from the negative side: F-064 and F-074
found tests that asserted the right thing via the wrong branch; this is the same failure where the
wrong branch is *emptiness*.

The same run turned up a second instance with a different mechanism: the project-isolation case sent
`x-tessera-project: beta` and asserted 404. But `registerProjectSelection` **404s an unknown project
in a preHandler**, before the route runs — so the test proved only that a project called `beta` did
not exist. It never reached the code it named.

**How to apply:**

1. **Plant a decoy.** For every "must not see X" test, make the wrong answer *available*: put
   different content at the location the broken implementation would read. Then "unscoped" means
   "200 with the decoy", not "404 by accident". In F-075 that is one fixture entry under
   `default/default` holding the same ref with different text.
2. **Mutation-check every negative assertion**, not just the tricky ones. Delete the guard; the test
   must go red. If it stays green, the test is decorative — and it was written precisely because the
   behaviour matters.
3. **Check the assertion reaches the code it names.** If a test drives a route through a header, an
   id, or a path parameter, confirm no middleware short-circuits it first. A useful tell: temporarily
   assert the *success* case with the same setup. If that also fails, the request never arrived.
4. **Pair each negative with its positive** in the same test where possible — owner reads 200 *with
   the expected content*, stranger reads 404. A negative alone cannot tell you the pipe was connected.
