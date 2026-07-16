import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';
import { FIXTURE_TERM, readHandoff } from '../support/handoff.js';

/**
 * The **agent journey** (F-048; NFR-16): a real MCP client launching the real `tessera-mcp` binary over
 * stdio — exactly how a coding agent connects to a self-hosted Tessera — against **the same deployment
 * the human journey used**. This is the test that proves ADR-0036's "one engine, two surfaces" claim
 * over real files rather than a shared in-process object.
 *
 * **Why the MCP process runs in zero-auth mode:** the stdio transport carries no `Authorization` header
 * and no SDK `authInfo` (those come from an HTTP transport's auth middleware), so today there is **no
 * way to hand a Bearer token to `tessera-mcp` over stdio** — token mode would reject every call as
 * UNAUTHORIZED. Zero-auth + an explicit tenant is the real, supported shape for a local agent (the
 * single-user machine case), so that is what we drive. The gap is recorded as a finding (**F-072**),
 * not papered over here.
 *
 * The tenant is the deployment's default one for a second reason — see the `TENANT` note in
 * `support/full-stack-server.mjs` and **F-071** (ingestion indexes into the default tenant).
 */
const repoRoot = resolve(process.cwd(), '../..');
const mcpBin = resolve(repoRoot, 'apps/server/dist/bin/mcp.js');

/** A tool result as `runTool` frames it (text JSON + structuredContent). */
interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
}

/** The JSON an agent actually pays tokens for. */
function payloadOf(result: ToolResult): string {
  return result.content?.map((part) => part.text ?? '').join('') ?? '';
}

function structured<T>(result: ToolResult): T {
  expect(result.isError, `tool failed: ${payloadOf(result)}`).toBeFalsy();
  return result.structuredContent as T;
}

test('a real MCP agent works the same deployment: search → compile → effects → capture → add_source', async () => {
  const handoff = readHandoff();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpBin],
    env: {
      ...(process.env as Record<string, string>),
      // Attach to the SAME data dir the API server is serving (SQLite is WAL, so this is safe).
      ...handoff.env,
      // See the note above: stdio has no credential channel, so the local agent shape is zero-auth
      // bound to the tenant whose data we want.
      TESSERA_AUTH_MODE: 'none',
      TESSERA_AUTH_TENANT: handoff.tenantId,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'e2e-full-agent', version: '0.0.0' });

  try {
    await client.connect(transport);

    // ---- The agent sees the repo the HUMAN's server ingested (one engine, two surfaces) ----------
    const search = (await client.callTool({
      name: 'search',
      arguments: { query: `${FIXTURE_TERM} ledger`, limit: 5 },
    })) as ToolResult;
    const { results } = structured<{ results: { ref: string; signals: { signal: string }[] }[] }>(
      search,
    );
    expect(results.length).toBeGreaterThan(0);
    // Refs are content hashes, not paths — so assert on the SIGNAL. A keyword (FTS) hit on a term
    // that exists in no other document can only come from the fixture the API server scanned.
    expect(results.some((hit) => hit.signals.some((s) => s.signal === 'keyword'))).toBe(true);

    // Token-lean (ADR-0036): a ranked answer is refs + scores, never a dump of the corpus.
    expect(payloadOf(search).length).toBeLessThan(20_000);

    // ---- compile_context is budget-bounded ------------------------------------------------------
    const budget = 1500;
    const compile = (await client.callTool({
      name: 'compile_context',
      arguments: { task: `How does the ${FIXTURE_TERM} ledger work?`, budget },
    })) as ToolResult;
    const pkg = structured<{
      totalTokens: number;
      sections: { fragments: { text?: string }[] }[];
    }>(compile);
    // The budget is a promise, not a hint (FR-30).
    expect(pkg.totalTokens).toBeLessThanOrEqual(budget);
    expect(pkg.sections.length).toBeGreaterThan(0);
    // And the package carries the fixture's REAL prose — the agent compiled the same repository the
    // human's dashboard compiled, out of one engine.
    const compiled = pkg.sections
      .flatMap((section) => section.fragments)
      .map((fragment) => fragment.text ?? '')
      .join('\n');
    expect(compiled.toLowerCase()).toContain(FIXTURE_TERM);

    // ---- get_effects returns a real dependent from the fixture's import chain -------------------
    // reporting.ts imports ledger.ts, so changing ledger requires reviewing reporting (FR-18/19).
    // Node keys are source-relative and extensionless (fileNodeKey).
    const effects = (await client.callTool({
      name: 'get_effects',
      arguments: { kind: 'file', key: 'src/ledger' },
    })) as ToolResult;
    const { effects: hits } = structured<{ effects: { node: { key: string } }[] }>(effects);
    expect(hits.some((hit) => hit.node.key === 'src/reporting')).toBe(true);

    // ---- capture_memory writes to the same store the dashboard reads ----------------------------
    const title = `Agent-captured quernstone note (e2e ${Date.now()})`;
    const captured = (await client.callTool({
      name: 'capture_memory',
      arguments: {
        kind: 'lesson',
        title,
        body: 'The quernstone ledger is append-only; corrections append a compensating entry.',
      },
    })) as ToolResult;
    const memory = structured<{ lineageId: string; version: number }>(captured);
    expect(memory.version).toBe(1);

    // The REST surface — the same engine — serves what the agent just wrote.
    const listed = await fetch(`${handoff.apiUrl}/v1/memory`, {
      headers: { authorization: `Bearer ${handoff.token}` },
    });
    expect(listed.status).toBe(200);
    const { memories } = (await listed.json()) as { memories: { title: string }[] };
    expect(memories.some((entry) => entry.title === title)).toBe(true);

    // ---- add_source: agents manage their own context (ADR-0036 parity) --------------------------
    const added = (await client.callTool({
      name: 'add_source',
      arguments: {
        kind: 'filesystem',
        root: resolve(handoff.fixtureRoot, 'docs'),
        label: 'agent-added-docs',
      },
    })) as ToolResult;
    const source = structured<{ id: string; label: string }>(added);
    expect(source.label).toBe('agent-added-docs');

    // And it is visible to the REST surface too — one control plane, not two.
    const sources = await fetch(`${handoff.apiUrl}/v1/sources`, {
      headers: { authorization: `Bearer ${handoff.token}` },
    });
    const { sources: listedSources } = (await sources.json()) as { sources: { label: string }[] };
    expect(listedSources.some((entry) => entry.label === 'agent-added-docs')).toBe(true);
  } finally {
    await client.close().catch(() => undefined);
  }
});
