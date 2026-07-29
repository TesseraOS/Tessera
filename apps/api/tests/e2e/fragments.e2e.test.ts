import type { FragmentSource, SourceFragment } from '@tessera/context-compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  createInMemoryTokenStore,
  createTokenAuthProvider,
  type ApiServices,
  type TokenStore,
} from '../../src/index';
import { MAX_FRAGMENT_TEXT_CHARS } from '../../src/schemas/fragments';
import { createInMemoryServices } from './support/in-memory-services';

const ACME_REF = 'a'.repeat(64);
const BIG_REF = 'b'.repeat(64);

/**
 * A genuinely scope-aware corpus, mirroring `createBlobFragmentSource`: fragments live under one
 * `(tenant, project)` and a view bound anywhere else resolves nothing.
 *
 * The shared fixture source in `support/` is deliberately scope-blind (it serves several suites that
 * authenticate as different tenants against one corpus). Using it here would make the cross-tenant
 * assertion below pass without the route being scoped at all — so this suite brings its own.
 */
function scopedFragments(
  corpus: Record<string, Record<string, SourceFragment>>,
  view = 'default/default',
): FragmentSource {
  return {
    get: (ref) => Promise.resolve(corpus[view]?.[ref]),
    forTenant: (tenantId) => scopedFragments(corpus, `${tenantId}/default`),
    forProject: (projectId) => scopedFragments(corpus, `${view.split('/')[0] ?? ''}/${projectId}`),
  };
}

/** `GET /v1/fragments/:ref` — the corpus read surface (F-075; FR-52, NFR-13, ADR-0067). */
describe('@tessera/api /v1/fragments/:ref', () => {
  let services: ApiServices;
  let app: ReturnType<typeof buildServer>;
  let tokenStore: TokenStore;

  const tokenFor = async (
    tenantId: string,
    roles: ('owner' | 'member' | 'viewer')[] = ['member'],
    scopes?: string[],
  ): Promise<string> =>
    (
      await tokenStore.issue({
        tenantId,
        principalId: `p-${tenantId}`,
        roles,
        ...(scopes !== undefined ? { scopes } : {}),
      })
    ).token;

  beforeEach(async () => {
    const base = await createInMemoryServices();
    services = {
      ...base,
      fragments: scopedFragments({
        'acme/default': {
          [ACME_REF]: {
            ref: ACME_REF,
            kind: 'code',
            text: 'export const settlement = roundHalfEven(amount);',
            metadata: { path: 'src/reporting/ledger.ts', sourceId: 's1' },
          },
          [BIG_REF]: {
            ref: BIG_REF,
            kind: 'markdown',
            text: 'x'.repeat(MAX_FRAGMENT_TEXT_CHARS + 500),
          },
        },
        'acme/beta': {},
        'globex/default': {},
        // A DECOY under the unscoped base view, holding the same ref with different content.
        // Without it, every negative assertion below would pass against a route that dropped its
        // scoping entirely — the base view would simply be empty and 404 for the wrong reason.
        // With it, "unscoped" means "200 with the decoy body", so the tests fail when they should.
        'default/default': {
          [ACME_REF]: { ref: ACME_REF, kind: 'code', text: 'DECOY — the unscoped base view' },
        },
      }),
    };
    tokenStore = createInMemoryTokenStore();
    app = buildServer(services, {
      auth: createTokenAuthProvider({ tokenStore }),
      tokenStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the owning tenant the full body, with its path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${ACME_REF}`,
      headers: { authorization: `Bearer ${await tokenFor('acme')}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ref: ACME_REF,
      kind: 'code',
      text: 'export const settlement = roundHalfEven(amount);',
      path: 'src/reporting/ledger.ts',
      truncated: false,
    });
    // The projection is narrow on purpose — the ingestion metadata bag never rides the wire.
    expect(Object.keys(res.json())).not.toContain('metadata');
    expect(res.json().sourceId).toBeUndefined();
  });

  it('gives tenant B a 404 for tenant A ref — identical to a ref that never existed', async () => {
    // THE acceptance clause. Refs are `sha256(sourceId:path)`, so globex can derive this one; what
    // stops it is that its scoped view has nothing under that key.
    const cross = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${ACME_REF}`,
      headers: { authorization: `Bearer ${await tokenFor('globex')}` },
    });
    const missing = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${'c'.repeat(64)}`,
      headers: { authorization: `Bearer ${await tokenFor('globex')}` },
    });

    // Indistinguishable from the never-existed case: same status, same code, same message. A 403
    // here would confirm the ref is real, which is the existence leak the 404 rule prevents.
    expect(cross.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(cross.json().error.code).toBe(missing.json().error.code);
    expect(cross.json().error.message).toBe(missing.json().error.message);
    // The only thing that differs between the two responses is the ref the CALLER supplied — its
    // own input echoed back, which tells it nothing it did not already know.
    expect(cross.json().error.details).toEqual({ ref: ACME_REF });
  });

  it('scopes by project as well as tenant — the same tenant, another project, sees nothing', async () => {
    const owner = `Bearer ${await tokenFor('acme', ['owner'])}`;

    // A REAL project. An invented header value never reaches this route at all — the project
    // selection preHandler 404s an unknown project first, so asserting against `beta` would have
    // proved only that `beta` does not exist. (It did, until this test was checked by mutation.)
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: owner },
      payload: { name: 'Beta' },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${ACME_REF}`,
      headers: { authorization: owner, 'x-tessera-project': projectId },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.details).toEqual({ ref: ACME_REF });
  });

  it('caps an oversized body and SAYS it was capped', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${BIG_REF}`,
      headers: { authorization: `Bearer ${await tokenFor('acme')}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().truncated).toBe(true);
    expect(res.json().text).toHaveLength(MAX_FRAGMENT_TEXT_CHARS);
  });

  it('requires fragments:read — a token scoped to search alone cannot read a body', async () => {
    // Least privilege doing its job: reusing `search:read` for this route would have handed every
    // already-issued search token an unbounded body reader.
    const token = await tokenFor('acme', ['member'], ['search:read']);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/fragments/${ACME_REF}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects a traversal ref as a validation error, never a read', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/fragments/..',
      headers: { authorization: `Bearer ${await tokenFor('acme')}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('answers a typed error when no corpus is configured (the doc-generation path)', async () => {
    const bare = buildServer({ ...services, fragments: undefined });
    await bare.ready();
    try {
      const res = await bare.inject({ method: 'GET', url: `/v1/fragments/${ACME_REF}` });
      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe('INTERNAL');
      // The message is MASKED at the boundary — "the corpus is not configured" is an internal
      // detail, and the envelope deliberately does not hand it to a caller.
      expect(res.json().error.message).toBe('internal server error');
    } finally {
      await bare.close();
    }
  });
});
