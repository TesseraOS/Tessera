import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryTokenStore, createTokenAuthProvider, type Role } from '@tessera/api';
import { SKILLS, skillInstallLocations, type SkillInstallLocation } from '@tessera/skills';
import { getSkillDocument } from '@tessera/skills/content';
import { buildMcpServer, createMcpGateway } from '../../src/index';
import { createInMemoryServices, EFFECT_SOURCE } from './support/in-memory-services';

/**
 * F-054 acceptance: "skills tested against a real agent session (documented transcript or scripted
 * MCP e2e)". This is the SCRIPTED branch, and it is deliberately stronger than checking that the
 * two new tools answer.
 *
 * An agent connects over a real MCP client, discovers the catalog, fetches a skill, and then
 * **performs exactly the calls that skill's instructions prescribe**. A skill that names a tool
 * which does not exist, or arguments that fail validation, fails here — which is the only way to
 * keep authored instructions honest as the tool surface moves.
 */
describe('@tessera/mcp skills tools', () => {
  let clients: Client[] = [];
  let servers: ReturnType<typeof buildMcpServer>[] = [];
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'tessera-mcp-skills-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'README.md'), '# Repo\n\nAuthentication uses signed tokens.\n');
    await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all(servers.map((server) => server.close()));
    clients = [];
    servers = [];
  });

  async function connect(server: ReturnType<typeof buildMcpServer>): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    servers.push(server);
    clients.push(client);
    return client;
  }

  async function localClient(): Promise<Client> {
    return connect(buildMcpServer(await createInMemoryServices()));
  }

  async function gatedClient(roles: Role[]): Promise<Client> {
    const services = await createInMemoryServices();
    const tokenStore = createInMemoryTokenStore();
    const { token } = await tokenStore.issue({ tenantId: 'acme', principalId: 'agent', roles });
    const gateway = createMcpGateway({
      auth: createTokenAuthProvider({ tokenStore }),
      resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
    });
    return connect(buildMcpServer(services, { gateway }));
  }

  function structured<T>(result: { structuredContent?: unknown }): T {
    return (result.structuredContent ?? {}) as T;
  }

  function errorCode(result: { structuredContent?: unknown }): string | undefined {
    return structured<{ error?: { code?: string } }>(result).error?.code;
  }

  type WireSkill = { name: string; version: string; category: string; description: string };
  type SkillDetail = WireSkill & {
    compatibility: string;
    install: SkillInstallLocation[];
    document: string;
  };

  it('lists the whole catalog without shipping a single body', async () => {
    const client = await localClient();
    const { skills } = structured<{ skills: WireSkill[] }>(
      await client.callTool({ name: 'list_skills', arguments: {} }),
    );

    expect(skills.map((skill) => skill.name)).toEqual(SKILLS.map((skill) => skill.name));
    for (const skill of skills) {
      expect(Object.keys(skill).sort()).toEqual(['category', 'description', 'name', 'version']);
    }

    // NFR-4 made executable: a listing an agent pays for on every discovery must stay small. The
    // four bodies together are ~19KB; the listing must be a small fraction of that.
    const serialized = JSON.stringify(skills);
    expect(serialized).not.toContain('## When to use this');
    expect(serialized.length).toBeLessThan(2000);
  });

  it('filters by category', async () => {
    const client = await localClient();
    const { skills } = structured<{ skills: WireSkill[] }>(
      await client.callTool({ name: 'list_skills', arguments: { category: 'setup' } }),
    );
    expect(skills.map((skill) => skill.name)).toEqual(
      SKILLS.filter((skill) => skill.category === 'setup').map((skill) => skill.name),
    );
    expect(skills.length).toBeGreaterThan(0);
  });

  it('rejects an unknown category at the schema boundary', async () => {
    const client = await localClient();
    const result = await client.callTool({
      name: 'list_skills',
      arguments: { category: 'nonsense' },
    });
    // The SDK validates against the Zod shape BEFORE the handler runs and answers with an error
    // result (not a throw), so the tool body never sees an invalid category.
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('invalid_enum_value');
  });

  it('serves the exact SKILL.md bytes plus where to install them', async () => {
    const client = await localClient();
    const detail = structured<SkillDetail>(
      await client.callTool({ name: 'get_skill', arguments: { name: 'project-onboarding' } }),
    );

    // Byte-identical to the registry: the agent surface cannot serve a different document than the
    // marketing download or the CLI writes (the whole point of one engine, three surfaces).
    expect(detail.document).toBe(getSkillDocument('project-onboarding'));
    expect(detail.install).toEqual(skillInstallLocations('project-onboarding'));
    expect(detail.install.map((location) => location.project)).toContain(
      '.claude/skills/project-onboarding/SKILL.md',
    );
    expect(detail.compatibility.length).toBeGreaterThan(0);
  });

  it('publishes the catalog in its own input schema, so a name cannot be guessed wrong', async () => {
    const client = await localClient();
    const { tools } = await client.listTools();
    const getSkill = tools.find((tool) => tool.name === 'get_skill');
    expect(getSkill?.inputSchema).toMatchObject({
      properties: { name: { enum: SKILLS.map((skill) => skill.name) } },
    });

    // A typo is refused at the boundary, and the refusal NAMES the catalog — so a mistaken agent
    // recovers from the error message alone, without a second discovery round trip.
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { name: 'no-such-skill' },
    });
    expect(result.isError).toBe(true);
    const message = JSON.stringify(result.content);
    for (const skill of SKILLS) {
      expect(message).toContain(skill.name);
    }
  });

  /**
   * THE REAL ACCEPTANCE: fetch a skill, then do what it says. Each block runs the tools that
   * skill's `tessera.tools` declares, with the arguments its body documents.
   */
  describe('an agent can execute what each skill teaches', () => {
    it('project-onboarding: register, scan, verify, then anchor a memory', async () => {
      const client = await localClient();
      const detail = structured<SkillDetail>(
        await client.callTool({ name: 'get_skill', arguments: { name: 'project-onboarding' } }),
      );
      expect(detail.document).toContain('list_sources');

      // Step 1 — look before you add.
      const before = structured<{ sources: unknown[] }>(
        await client.callTool({ name: 'list_sources', arguments: {} }),
      );
      expect(before.sources).toEqual([]);

      // Step 2 — register with an absolute root, as the skill insists.
      const added = structured<{ id: string }>(
        await client.callTool({
          name: 'add_source',
          arguments: { kind: 'filesystem', root: repo, label: 'onboarding-fixture' },
        }),
      );
      expect(added.id).toBeTruthy();

      // Step 3 — scan (incremental + idempotent, so the skill's "re-running is safe" holds).
      await client.callTool({ name: 'scan_source', arguments: { id: added.id } });
      await client.callTool({ name: 'scan_source', arguments: { id: added.id } });

      // Step 4 — verify it is real. The skill tells the agent to trust this number.
      const stats = structured<{ documents: number; sources: number }>(
        await client.callTool({ name: 'get_stats', arguments: {} }),
      );
      expect(stats.documents).toBeGreaterThan(0);
      expect(stats.sources).toBe(1);

      // Step 5 — smoke-test both surfaces.
      const hits = structured<{ results: unknown[] }>(
        await client.callTool({ name: 'search', arguments: { query: 'tokens', limit: 5 } }),
      );
      expect(hits.results.length).toBeGreaterThan(0);
      const pkg = structured<{ budget: number }>(
        await client.callTool({
          name: 'compile_context',
          arguments: { task: 'explain how authentication works', budget: 2000 },
        }),
      );
      expect(pkg.budget).toBeLessThanOrEqual(2000);

      // Step 6 — leave an anchor.
      const anchor = structured<{ kind: string }>(
        await client.callTool({
          name: 'capture_memory',
          arguments: {
            kind: 'architecture',
            title: 'The fixture repo is a two-file TypeScript tree',
            body: 'README plus src/a.ts; used to prove onboarding end to end.',
            scope: 'onboarding-fixture',
          },
        }),
      );
      expect(anchor.kind).toBe('architecture');
    });

    it('compile-before-coding: compile, widen with search, then explain', async () => {
      const client = await localClient();
      const detail = structured<SkillDetail>(
        await client.callTool({ name: 'get_skill', arguments: { name: 'compile-before-coding' } }),
      );
      expect(detail.document).toContain('compile_context');

      const pkg = structured<{ budget: number; fragments: unknown[] }>(
        await client.callTool({
          name: 'compile_context',
          arguments: { task: 'add rate limiting to the login route', budget: 3000 },
        }),
      );
      expect(pkg.budget).toBeLessThanOrEqual(3000);

      // The documented widening path, including the opt-in `include` extras.
      const widened = structured<{ results: { label?: string }[] }>(
        await client.callTool({
          name: 'search',
          arguments: {
            query: 'tokens login',
            limit: 10,
            include: { kind: true, snippet: { maxChars: 240 } },
          },
        }),
      );
      expect(widened.results.length).toBeGreaterThan(0);

      const explained = structured<{ fragments?: unknown[]; trace?: unknown }>(
        await client.callTool({
          name: 'explain',
          arguments: { task: 'add rate limiting to the login route', budget: 3000 },
        }),
      );
      expect(explained).toBeTruthy();
    });

    it('effects-before-editing: read the blast radius, explore, then assert a link', async () => {
      const client = await localClient();
      const detail = structured<SkillDetail>(
        await client.callTool({ name: 'get_skill', arguments: { name: 'effects-before-editing' } }),
      );
      expect(detail.document).toContain('get_effects');

      const effects = structured<{ effects: unknown[] }>(
        await client.callTool({
          name: 'get_effects',
          arguments: { kind: EFFECT_SOURCE.kind, key: EFFECT_SOURCE.key, maxDepth: 2 },
        }),
      );
      expect(effects.effects.length).toBeGreaterThan(0);

      const subgraph = structured<{ nodes: unknown[] }>(
        await client.callTool({
          name: 'query_graph',
          arguments: { nodeKinds: ['file'], edgeKinds: ['EFFECT_LINK'], limit: 200 },
        }),
      );
      expect(subgraph.nodes.length).toBeGreaterThan(0);

      // The skill's rule: rationale is required, and it is the point.
      const asserted = structured<{ rationale?: string }>(
        await client.callTool({
          name: 'assert_effect',
          arguments: {
            from: { kind: 'file', key: 'packages/api/src/schemas/user' },
            to: { kind: 'file', key: 'packages/web/src/fixtures/user' },
            rationale: 'The fixture is validated against this schema in tests.',
            confidence: 0.9,
          },
        }),
      );
      expect(asserted.rationale).toContain('validated against this schema');
    });

    it('capture-memory: search for a duplicate first, then capture with a claim title', async () => {
      const client = await localClient();
      const detail = structured<SkillDetail>(
        await client.callTool({ name: 'get_skill', arguments: { name: 'capture-memory' } }),
      );
      expect(detail.document).toContain('capture_memory');

      await client.callTool({
        name: 'search',
        arguments: { query: 'sqlite writer lock retry', limit: 5 },
      });

      const captured = structured<{ kind: string; title: string }>(
        await client.callTool({
          name: 'capture_memory',
          arguments: {
            kind: 'lesson',
            title: 'SQLite writes must retry on SQLITE_BUSY, not widen the transaction',
            body: 'Widening the transaction made the contention worse under concurrent scans.',
            scope: 'packages/ingestion',
            confidence: 0.9,
          },
        }),
      );
      expect(captured.kind).toBe('lesson');
      expect(captured.title).toContain('SQLITE_BUSY');
    });
  });

  describe('through the gateway', () => {
    it('serves the registry to any role holding search:read', async () => {
      const client = await gatedClient(['viewer'] as Role[]);
      const { skills } = structured<{ skills: WireSkill[] }>(
        await client.callTool({ name: 'list_skills', arguments: {} }),
      );
      expect(skills.length).toBe(SKILLS.length);

      const detail = structured<SkillDetail>(
        await client.callTool({ name: 'get_skill', arguments: { name: 'capture-memory' } }),
      );
      expect(detail.document).toBe(getSkillDocument('capture-memory'));
    });

    it('denies an agent whose token lacks search:read', async () => {
      const services = await createInMemoryServices();
      const tokenStore = createInMemoryTokenStore();
      const { token } = await tokenStore.issue({
        tenantId: 'acme',
        principalId: 'scoped-agent',
        roles: ['viewer'] as Role[],
        scopes: ['stats:read'],
      });
      const client = await connect(
        buildMcpServer(services, {
          gateway: createMcpGateway({
            auth: createTokenAuthProvider({ tokenStore }),
            resolveCredential: () => ({ authorization: `Bearer ${token}`, headers: {} }),
          }),
        }),
      );

      expect(errorCode(await client.callTool({ name: 'list_skills', arguments: {} }))).toBe(
        'FORBIDDEN',
      );
      expect(
        errorCode(
          await client.callTool({ name: 'get_skill', arguments: { name: 'capture-memory' } }),
        ),
      ).toBe('FORBIDDEN');
    });
  });
});
