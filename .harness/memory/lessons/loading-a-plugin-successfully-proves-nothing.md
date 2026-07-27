---
id: loading-a-plugin-successfully-proves-nothing
kind: lesson
title: A test that asserts "it worked" often survives deleting the thing that made it work
links:
  - packages/plugin-host/src/host.test.ts
  - packages/plugin-host/src/plugins/filesystem-connector.ts
  - apps/web/tests/e2e/settings.spec.ts
confidence: 1
created: 2026-07-27
---

**What happened:** F-058 gave first-party plugins a `context.permissions.require(...)` call and wrote
a test named *"the first-party filesystem connector actually asks before it walks a root"*. It
asserted `host.load(...)` returned `status: 'loaded'`. A mutation that **deleted the `require` call
entirely** left the test green — because a plugin that never asks loads just as successfully as one
that asks and is granted. The test's name made a claim its assertion could not support.

The same session found the same shape in a second place: `apps/web/tests/e2e/settings.spec.ts` ran
its axe assertion over the new flags card without stubbing `GET /v1/flags`, so a11y had been
analysing the card's **error branch** rather than the populated table an operator sees.

**Why:** a success assertion is satisfied by *every* path that reaches success, including the one
where the guard under test is absent. Positive-path tests confirm the feature is reachable; they do
not pin the mechanism. And an unstubbed dependency in a UI test does not fail — the component just
renders a different branch, silently, and the assertion still passes over it.

**How to apply:**

1. When testing a **guard**, assert the refusal, not the success. Construct the variant where the
   guard *should* fire — strip the declaration, remove the grant, drop the credential — and assert
   the same code path is now refused. That is what makes the positive test meaningful.
2. Run the mutation *on the production call site*, not only on the framework code. The mutation that
   found this deleted a line in `filesystem-connector.ts`, not in `host.ts`.
3. In component/e2e tests, **stub every route the component under test calls**, then assert content
   that only the success branch renders. If an assertion would still pass with the API down, it is
   not testing what its name says.
4. Report an equivalent mutant as equivalent. Two survived in F-058 (a redundant `status === 'failed'`
   guard, a redundant `separator <= 0` bound) and both were genuinely unobservable — claiming N/N red
   when one is equivalent is the same class of dishonesty as the test above.

See [[mutation-check-before-declaring-a-test-suite-strong]] and [[engineering-standards]].
