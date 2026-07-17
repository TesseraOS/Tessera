import { expect, test } from '@playwright/test';
import { FIXTURE_TERM, readHandoff } from '../support/handoff.js';

/**
 * The **human journey** (F-048; NFR-16): one person, one session, against the real deployment — the
 * real dashboard talking to the real server that ingested a real repository. Every other web e2e stubs
 * the API; this one doesn't, so it is the only test that would catch a break between the two.
 *
 * It runs as ONE test on purpose: it is a journey, and each step depends on the last (you cannot see
 * sources before signing in). Splitting it into independent tests would either re-do sign-in per test
 * or leak state between them.
 */
test('sign in → sources → search → inspector → capture memory → audit, against a live deployment', async ({
  page,
}) => {
  const handoff = readHandoff();

  // ---- 1. Sign in (token mode) against the real server's token store -------------------------
  await page.goto('/sources');
  await expect(page).toHaveURL(/\/signin\?return=%2Fsources/);
  await page.getByLabel('API token').fill(handoff.token);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/sources$/);

  // ---- 2. Sources shows the fixture repo the server actually scanned -------------------------
  // The label and root come from the real registration, not a fixture stub. `exact` matters: the
  // agent journey registers `<fixtureRoot>/docs` against this same deployment, so a substring match
  // is ambiguous depending on spec order — that ambiguity is the two surfaces genuinely sharing one
  // control plane, which is the thing this suite exists to prove.
  await expect(page.getByText('quernstone-fixture')).toBeVisible();
  await expect(page.getByText(handoff.fixtureRoot, { exact: true })).toBeVisible();

  // ---- 3. Search returns content from that repo ----------------------------------------------
  // Real retrieval carries real provenance: hits show the signals that produced them (FR-26). The
  // **keyword** signal is the load-bearing one — an FTS hit on a term that appears in no other
  // document can only have come from the scanned fixture. (Semantic alone would prove less: vector
  // search has no relevance floor, so it returns nearest neighbours for any query at all.)
  await page.goto('/search');
  await page.getByLabel('Search query').fill(FIXTURE_TERM);
  await expect(page.getByText('keyword').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('semantic').first()).toBeVisible();

  // Results are labelled by their real source path (F-061/F-073). This assertion is the point of
  // F-073: before it, this spec could only check the signals, because every hit rendered as a
  // 64-char content hash. A path is only here if the ref reached the corpus and came back with its
  // metadata — over a real scan, through the real proxy, in a real browser.
  await expect(page.getByText('ledger.ts').first()).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{64}$/)).toHaveCount(0);

  // And the excerpt is real fixture prose with the queried term marked, not a placeholder.
  await expect(page.locator('mark').first()).toHaveText(new RegExp(FIXTURE_TERM, 'i'));

  // ---- 4. Inspector compiles a cited, budget-bounded package ---------------------------------
  await page.goto('/inspector');
  await page.getByLabel('Task description').fill(`How does the ${FIXTURE_TERM} ledger work?`);
  await page.getByLabel('Token budget').fill('2000');
  await page.getByRole('button', { name: 'Compile' }).click();

  // The package carries the fixture's REAL text, cited, and explains itself (FR-32) — not a shell.
  await expect(page.getByText('Compilation trace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/append-only/i).first()).toBeVisible();

  // Fragments are CITED BY PATH (F-062), not by the 64-char content hash the Inspector rendered
  // until now. This is the only place that claim can be proven: the citation comes from corpus
  // metadata that round-trips through a real scan of a real repo, not from a fixture.
  await expect(page.getByText(/ledger\.ts/).first()).toBeVisible();

  // Scores render because this package HAS fragments. An empty one shows guidance instead — the
  // "Budget adherence 100% · 0 fragments" state the 2026-07-04 review found.
  await expect(page.getByText('Package scores')).toBeVisible();

  // ---- 5. Capture a memory through the UI ----------------------------------------------------
  const memoryTitle = `Quernstone ledger is append-only (e2e ${Date.now()})`;
  await page.goto('/memory');
  await page.getByRole('button', { name: 'New memory' }).first().click();
  await page.getByLabel('Title').fill(memoryTitle);

  // The body is the REAL Monaco editor (lazy, ssr:false). Two things follow: it is a contenteditable,
  // not an <input>, so it must be TYPED into rather than `fill`ed; and it must be FOCUSED rather than
  // clicked, because Monaco's `.view-line` overlay intercepts pointer events over the edit surface.
  // Unit tests stub Monaco out, so this suite is the only place the real editor is ever exercised.
  const body = page.getByLabel('Memory body (markdown)');
  await body.waitFor({ state: 'visible', timeout: 30_000 });
  await body.focus();
  await page.keyboard.type('Corrections append a compensating entry.');

  await page.getByRole('button', { name: 'Capture memory' }).click();

  // It round-trips through the real server and comes back in the real list.
  await expect(page.getByText(memoryTitle).first()).toBeVisible({ timeout: 20_000 });

  // ---- 6. The audit trail shows what this session just did ------------------------------------
  await page.goto('/audit');
  // The capture above is a real recorded action by the real principal.
  await expect(page.getByText('e2e-user').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Memory write').first()).toBeVisible();
});
