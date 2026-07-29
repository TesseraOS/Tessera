import { expect, test } from '@playwright/test';
import { FIXTURE_B_TERM, FIXTURE_TERM, readHandoff } from '../support/handoff.js';

/**
 * F-071 clauses 2 + 5, over the ONE real deployment (NFR-16): content scanned under a
 * (tenant, project) is searchable/compilable/graph-visible AS that scope, and invisible to any other.
 *
 * The setup (see `support/full-stack-server.mjs`) scanned three corpora through the real pipeline:
 *   - `quernstone` under (acme, default)
 *   - `sunstone`   under (globex, default)
 *   - `sunstone`   under (acme, beta)
 * so every cell below is a claim about REAL indexed content.
 *
 * **Isolation is asserted on the KEYWORD signal, not on an empty result set.** Fake embeddings have
 * no relevance floor, so the semantic signal returns *something* for any query — "garbage → empty"
 * never holds (the recorded F-048 lesson). A `keyword` signal means the term literally appears in a
 * document IN THAT SCOPE, so its presence/absence is the honest isolation proof.
 */

const handoff = readHandoff();

interface Hit {
  readonly ref: string;
  readonly kind?: string;
  readonly signals: readonly { readonly signal: string }[];
}

/** POST /v1/search as a tenant, optionally within a project (the X-Tessera-Project header). */
async function search(token: string, text: string, projectId?: string): Promise<Hit[]> {
  const response = await fetch(`${handoff.apiUrl}/v1/search`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(projectId !== undefined ? { 'x-tessera-project': projectId } : {}),
    },
    // `kind` is opt-in enrichment; the fragment test below needs it to tell a FILE hit from a
    // memory the human journey captured against this same live deployment.
    body: JSON.stringify({ query: text, include: { kind: true } }),
  });
  expect(response.status, `search "${text}"`).toBe(200);
  return ((await response.json()) as { results: Hit[] }).results;
}

/** True when some hit matched the term LITERALLY in this scope (a keyword-index hit). */
function hasKeywordHit(hits: readonly Hit[]): boolean {
  return hits.some((hit) => hit.signals.some((signal) => signal.signal === 'keyword'));
}

test.describe('scope-aware ingestion isolation (F-071)', () => {
  test('a tenant sees its own scanned content across search, compile, and the graph', async () => {
    // acme/default scanned quernstone — the keyword index matches it…
    expect(
      hasKeywordHit(await search(handoff.token, FIXTURE_TERM)),
      'acme must find quernstone',
    ).toBe(true);

    // …compile assembles a real package from it…
    const compiled = await fetch(`${handoff.apiUrl}/v1/compile`, {
      method: 'POST',
      headers: { authorization: `Bearer ${handoff.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task: `explain the ${FIXTURE_TERM} ledger`, budget: 2000 }),
    });
    expect(compiled.status).toBe(200);
    const pkg = (await compiled.json()) as { sections: unknown[] };
    expect(pkg.sections.length, 'acme must compile its own content').toBeGreaterThan(0);

    // …and the effect graph has the fixture's file dependency (reporting imports ledger).
    const effects = await getEffects(handoff.token, 'src/ledger');
    expect(effects.status).toBe(200);
    expect(
      effects.body.effects.some((hit) => hit.node.key === 'src/reporting'),
      'acme graph must link the fixture',
    ).toBe(true);
  });

  test('another tenant sees NONE of it — no keyword hit, no compile, empty graph', async () => {
    // globex never scanned quernstone, so nothing in its scope matches the term literally.
    expect(
      hasKeywordHit(await search(handoff.otherToken, FIXTURE_TERM)),
      'globex must not keyword-match acme content',
    ).toBe(false);

    const compiled = await fetch(`${handoff.apiUrl}/v1/compile`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${handoff.otherToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: `explain the ${FIXTURE_TERM} ledger`, budget: 2000 }),
    });
    expect(compiled.status).toBe(200);
    const pkg = (await compiled.json()) as { sections: { fragments: { text: string }[] }[] };
    // The compiler may assemble a package from globex's OWN corpus (sunstone), but it must never cite
    // acme's quernstone content.
    const allText = pkg.sections
      .flatMap((section) => section.fragments.map((f) => f.text))
      .join('\n');
    expect(allText, 'globex compile must not contain acme content').not.toContain(FIXTURE_TERM);

    // acme's `src/ledger` file node does not exist in globex's graph at all, so get_effects 404s —
    // the strongest possible "empty of acme content".
    const effects = await getEffects(handoff.otherToken, 'src/ledger');
    expect(effects.status, 'globex graph must not contain acme nodes').toBe(404);
  });

  test('content is isolated by PROJECT within a tenant, not only by tenant', async () => {
    // sunstone was scanned under acme/beta and globex/default — but NOT acme/default.
    expect(
      hasKeywordHit(await search(handoff.token, FIXTURE_B_TERM, handoff.betaProjectId)),
      'acme/beta must keyword-match sunstone',
    ).toBe(true);

    expect(
      hasKeywordHit(await search(handoff.token, FIXTURE_B_TERM)),
      'acme default project must not keyword-match beta content',
    ).toBe(false);

    // And quernstone lives in acme/default, so acme/beta must not keyword-match it.
    expect(
      hasKeywordHit(await search(handoff.token, FIXTURE_TERM, handoff.betaProjectId)),
      'acme/beta must not keyword-match acme/default content',
    ).toBe(false);
  });

  test('the same term in two tenants stays partitioned', async () => {
    // Both acme/beta and globex/default scanned sunstone — each keyword-matches its OWN copy…
    expect(hasKeywordHit(await search(handoff.otherToken, FIXTURE_B_TERM))).toBe(true);
    expect(hasKeywordHit(await search(handoff.token, FIXTURE_B_TERM, handoff.betaProjectId))).toBe(
      true,
    );
    // …but globex has no quernstone.
    expect(hasKeywordHit(await search(handoff.otherToken, FIXTURE_TERM))).toBe(false);
  });

  test('a file BODY is served to its owner and 404s for another tenant (F-075)', async () => {
    // The F-075 acceptance clause, over real blob keys rather than a fake. Refs are
    // `sha256(sourceId:path)` — globex can derive this one; what stops it is that its scoped view of
    // the corpus has nothing under `globex/default/<ref>`.
    //
    // The hit must be filtered to `kind: 'file'`, not merely to "has a keyword signal". The human
    // journey captures a memory titled `Quernstone ledger is append-only (e2e <ts>)` against THIS
    // deployment and runs first, so a keyword-only filter intermittently selected that memory —
    // whose body spells the term with a capital Q. The suite is serialized with retries:0 precisely
    // so a flake is a failure, and this one made the gate red on one run in two while skipping the
    // isolation assertions below entirely.
    const hits = await search(handoff.token, FIXTURE_TERM);
    const fileHit = hits.find(
      (hit) => hit.kind === 'file' && hit.signals.some((signal) => signal.signal === 'keyword'),
    );
    expect(fileHit, 'acme must have a keyword-matched FILE hit to read the body of').toBeDefined();
    const ref = fileHit!.ref;

    const owner = await readFragment(handoff.token, ref);
    expect(owner.status, 'acme must read its own file body').toBe(200);
    expect(owner.body.text.toLowerCase(), 'the served body must be the real file').toContain(
      FIXTURE_TERM.toLowerCase(),
    );
    expect(owner.body.truncated).toBe(false);

    const stranger = await readFragment(handoff.otherToken, ref);
    expect(stranger.status, 'globex must not read acme file bodies').toBe(404);
    // No part of the content leaks through the error either.
    expect(JSON.stringify(stranger.body).toLowerCase()).not.toContain(FIXTURE_TERM.toLowerCase());
  });
});

/** GET /v1/fragments/:ref as a tenant (F-075). Returns the status, since 404 IS the isolation signal. */
async function readFragment(
  token: string,
  ref: string,
): Promise<{ status: number; body: { text: string; truncated: boolean } }> {
  const response = await fetch(`${handoff.apiUrl}/v1/fragments/${encodeURIComponent(ref)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    status: response.status,
    body: (await response.json()) as { text: string; truncated: boolean },
  };
}

/**
 * GET /v1/effects for a file node in the caller's scope. Returns the raw status too, because a node
 * that does not exist IN THIS SCOPE 404s — which is itself an isolation signal, not an error to hide.
 */
async function getEffects(
  token: string,
  key: string,
): Promise<{ status: number; body: { effects: { node: { key: string } }[] } }> {
  const response = await fetch(
    `${handoff.apiUrl}/v1/effects?kind=file&key=${encodeURIComponent(key)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body =
    response.status === 200
      ? ((await response.json()) as { effects: { node: { key: string } }[] })
      : { effects: [] };
  return { status: response.status, body };
}
