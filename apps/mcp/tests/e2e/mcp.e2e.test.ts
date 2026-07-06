import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMcpServer } from '../../src/index';
import {
  createInMemoryServices,
  EFFECT_DEPENDENT_KEY,
  EFFECT_SOURCE,
} from './support/in-memory-services';

/** Drive the server through a REAL MCP client over a linked in-memory transport (FR-35 acceptance). */
describe('@tessera/mcp tools', () => {
  let client: Client;
  let server: ReturnType<typeof buildMcpServer>;

  beforeEach(async () => {
    const services = await createInMemoryServices();
    server = buildMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  /** Structured content from a tool call (no outputSchema, so the server passes it through). */
  function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
    return (result.structuredContent ?? {}) as Record<string, unknown>;
  }

  it('advertises the full tool set', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'add_source',
      'assert_effect',
      'capture_memory',
      'compile_context',
      'explain',
      'get_effects',
      'list_sources',
      'query_graph',
      'scan_source',
      'search',
    ]);
  });

  it('search returns a fused, ranked candidate set', async () => {
    const result = await client.callTool({
      name: 'search',
      arguments: { query: 'authentication tokens' },
    });
    expect(result.isError).toBeFalsy();
    const results = structured(result).results as unknown[];
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ ref: expect.any(String), score: expect.any(Number) });
  });

  it('compile_context returns a budget-bounded package', async () => {
    const result = await client.callTool({
      name: 'compile_context',
      arguments: { task: 'how does authentication work', budget: 80 },
    });
    expect(result.isError).toBeFalsy();
    const pkg = structured(result);
    expect(pkg.totalTokens as number).toBeLessThanOrEqual(80);
    expect(Array.isArray(pkg.sections)).toBe(true);
  });

  it('get_effects returns ranked dependents, and surfaces NOT_FOUND cleanly', async () => {
    const ok = await client.callTool({
      name: 'get_effects',
      arguments: { kind: EFFECT_SOURCE.kind, key: EFFECT_SOURCE.key },
    });
    expect(ok.isError).toBeFalsy();
    const effects = structured(ok).effects as { node: { key: string } }[];
    expect(effects.map((hit) => hit.node.key)).toContain(EFFECT_DEPENDENT_KEY);

    const missing = await client.callTool({
      name: 'get_effects',
      arguments: { kind: 'file', key: 'does/not/exist.ts' },
    });
    expect(missing.isError).toBe(true);
    expect((structured(missing).error as { code: string }).code).toBe('NOT_FOUND');
  });

  it('query_graph returns a bounded subgraph of nodes + edges', async () => {
    const result = await client.callTool({ name: 'query_graph', arguments: {} });
    expect(result.isError).toBeFalsy();
    const graph = structured(result);
    const nodes = graph.nodes as { key: string }[];
    const edges = graph.edges as { kind: string }[];
    expect(nodes.map((node) => node.key)).toContain(EFFECT_SOURCE.key);
    expect(edges.some((edge) => edge.kind === 'EFFECT_LINK')).toBe(true);
  });

  it('assert_effect adds a manual effect-link that get_effects then returns', async () => {
    const asserted = await client.callTool({
      name: 'assert_effect',
      arguments: {
        from: { kind: 'file', key: EFFECT_DEPENDENT_KEY },
        to: { kind: EFFECT_SOURCE.kind, key: EFFECT_SOURCE.key },
        rationale: 'app and core share a contract',
      },
    });
    expect(asserted.isError).toBeFalsy();
    expect(structured(asserted).origin).toBe('manual');

    const effects = await client.callTool({
      name: 'get_effects',
      arguments: { kind: 'file', key: EFFECT_DEPENDENT_KEY },
    });
    const keys = (structured(effects).effects as { node: { key: string } }[]).map(
      (h) => h.node.key,
    );
    expect(keys).toContain(EFFECT_SOURCE.key);
  });

  it('capture_memory stores version 1', async () => {
    const result = await client.callTool({
      name: 'capture_memory',
      arguments: { kind: 'lesson', title: 'Wrap one engine in two surfaces', body: 'REST + MCP.' },
    });
    expect(result.isError).toBeFalsy();
    expect(structured(result)).toMatchObject({ version: 1, supersededBy: null });
  });

  it('explain projects per-fragment provenance + the trace', async () => {
    const result = await client.callTool({
      name: 'explain',
      arguments: { task: 'how does authentication work', budget: 200 },
    });
    expect(result.isError).toBeFalsy();
    const explanation = structured(result);
    const fragments = explanation.fragments as { whyIncluded: string }[];
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments[0]).toHaveProperty('whyIncluded');
    expect(Array.isArray(explanation.trace)).toBe(true);
  });

  it('rejects invalid tool input', async () => {
    let failed = false;
    try {
      const result = await client.callTool({ name: 'search', arguments: {} });
      failed = result.isError === true;
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
