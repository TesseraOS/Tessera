import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, type ApiServices } from '../../src/index';
import {
  createInMemoryServices,
  EFFECT_DEPENDENT_KEY,
  EFFECT_SOURCE,
} from './support/in-memory-services';

/** End-to-end read of the knowledge graph over the HTTP surface (F-043; FR-42). */
describe('@tessera/api GET /v1/graph', () => {
  let services: ApiServices;
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    services = await createInMemoryServices();
    app = buildServer(services);
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns a coherent subgraph of nodes + edges', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/graph' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      nodes: { key: string }[];
      edges: { kind: string; from: string; to: string }[];
    };
    expect(body.nodes.map((node) => node.key).sort()).toEqual(
      [EFFECT_DEPENDENT_KEY, EFFECT_SOURCE.key].sort(),
    );
    expect(body.edges.some((edge) => edge.kind === 'EFFECT_LINK')).toBe(true);
  });

  it('filters by node kind and caps by limit', async () => {
    const noSymbols = await app.inject({ method: 'GET', url: '/v1/graph?nodeKinds=symbol' });
    expect((noSymbols.json() as { nodes: unknown[] }).nodes).toHaveLength(0);

    const capped = await app.inject({ method: 'GET', url: '/v1/graph?limit=1' });
    const cappedBody = capped.json() as { nodes: unknown[]; edges: unknown[] };
    expect(cappedBody.nodes).toHaveLength(1);
    expect(cappedBody.edges).toHaveLength(0);
  });
});
