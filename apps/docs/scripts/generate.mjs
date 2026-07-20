/**
 * The generated-reference pipeline (F-053; ADR-0054 §4): every machine-derivable fact the
 * docs present is DERIVED from its source of truth and committed under `generated/` —
 * never hand-edited. `tests/generated-drift.test.ts` regenerates in the standard `test`
 * gate and asserts byte-identity, so stale docs data is a red build, not a support ticket.
 *
 *   pnpm --filter @tessera/docs generate
 *
 * Artifacts (source of truth → file):
 *   packages/sdk/openapi.json (captured from the real Fastify app)  → generated/openapi.json
 *   @tessera/cli COMMANDS (the same table `tessera help` renders)   → generated/cli-reference.json
 *   @tessera/cli MCP_CLIENTS + renderMcpClientConfig                → generated/agent-clients.json
 *   the REAL MCP server's tools/list (spawned over stdio)           → generated/mcp-tools.json
 *   .env.example (completeness guarded by verify-state)             → generated/env-reference.json
 *
 * Requires `@tessera/cli` and `@tessera/server` to be built (both are devDependencies, so
 * turbo's `^build` ordering guarantees it for the gates).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const OUT_DIR = join(APP_ROOT, 'generated');

/** Stable serialization: 2-space indent + trailing newline, so diffs stay readable. */
function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// --- openapi.json — verbatim copy of the SDK's captured spec ------------------------------------

function generateOpenapi() {
  const spec = readFileSync(join(REPO_ROOT, 'packages', 'sdk', 'openapi.json'), 'utf8');
  return spec.endsWith('\n') ? spec : `${spec}\n`;
}

// --- cli-reference.json — the same COMMANDS table `tessera help` renders ------------------------

async function generateCliReference(cli) {
  return serialize({
    $source: 'apps/cli/src/cli.ts COMMANDS — regenerate with `pnpm --filter @tessera/docs generate`',
    bin: 'tessera',
    commands: cli.COMMANDS.map((command) => ({
      name: command.name,
      summary: command.summary,
      usage: command.usage,
    })),
  });
}

// --- agent-clients.json — MCP_CLIENTS through the CLI's own renderer ----------------------------

/**
 * Snippets use a placeholder config path (machine-specific at runtime — the docs tell
 * readers to run `tessera mcp-config` for resolved values) in both launch forms the CLI
 * supports: npx (the published-package default, pending F-059) and a local `tessera` bin.
 */
async function generateAgentClients(cli) {
  const CONFIG_PLACEHOLDER = '/absolute/path/to/tessera.config.json';
  const npxSpec = {
    command: 'npx',
    args: ['-y', '@tessera/cli', 'mcp', '--config', CONFIG_PLACEHOLDER],
  };
  const localSpec = { command: 'tessera', args: ['mcp', '--config', CONFIG_PLACEHOLDER] };
  return serialize({
    $source:
      'apps/cli/src/mcp-clients.ts MCP_CLIENTS + renderMcpClientConfig — regenerate with `pnpm --filter @tessera/docs generate`',
    configPlaceholder: CONFIG_PLACEHOLDER,
    clients: cli.MCP_CLIENTS.map((client) => ({
      id: client.id,
      label: client.label,
      file: client.file,
      format: client.format,
      snippetNpx: cli.renderMcpClientConfig(client, npxSpec),
      snippetLocal: cli.renderMcpClientConfig(client, localSpec),
    })),
  });
}

// --- mcp-tools.json — ask the real server over the real transport -------------------------------

async function generateMcpTools() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const mcpBin = join(REPO_ROOT, 'apps', 'server', 'dist', 'bin', 'mcp.js');
  const dataDir = mkdtempSync(join(tmpdir(), 'tessera-docs-gen-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpBin],
    env: {
      ...process.env,
      TESSERA_PROFILE: 'local',
      TESSERA_SQLITE_PATH: join(dataDir, 'tessera.sqlite'),
      TESSERA_VECTOR_PATH: join(dataDir, 'vectors.sqlite'),
      TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
      // Fake embeddings: the tool catalog is embedding-independent, and the transformers
      // provider would download its ~90MB model at boot (the recorded F-052 lesson).
      TESSERA_EMBEDDINGS_PROVIDER: 'fake',
      TESSERA_EMBEDDINGS_DIMENSION: '8',
      TESSERA_AUTH_MODE: 'none',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'tessera-docs-generate', version: '0.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const catalog = tools
      .map((tool) => ({
        name: tool.name,
        ...(tool.title !== undefined ? { title: tool.title } : {}),
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return serialize({
      $source:
        'tools/list from the real tessera-mcp stdio server — regenerate with `pnpm --filter @tessera/docs generate`',
      toolCount: catalog.length,
      tools: catalog,
    });
  } finally {
    await client.close().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
}

// --- env-reference.json — parsed from .env.example ----------------------------------------------

/**
 * .env.example is the config source of truth (verify-state's env-docs guard asserts every
 * TESSERA_* var the server reads is documented there). Parsed shape: sections (`# --- name ---`)
 * of vars; a commented-out `# VAR=value` documents an optional var with its default; preceding
 * plain comment lines become the description; a trailing `# comment` on the line is kept.
 */
function generateEnvReference() {
  const raw = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
  const sections = [];
  let current = null;
  let pendingComments = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^#\s*---\s*(.+?)\s*---\s*$/);
    if (sectionMatch) {
      current = { section: sectionMatch[1], vars: [] };
      sections.push(current);
      pendingComments = [];
      continue;
    }
    const varMatch = line.match(/^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (varMatch && current) {
      const [, commentMarker, name, rest] = varMatch;
      const inlineMatch = rest.match(/^(.*?)\s+#\s*(.*)$/);
      const value = (inlineMatch ? inlineMatch[1] : rest).trim();
      const inlineComment = inlineMatch ? inlineMatch[2].trim() : undefined;
      current.vars.push({
        name,
        default: value,
        optional: commentMarker !== undefined,
        ...(inlineComment !== undefined ? { note: inlineComment } : {}),
        ...(pendingComments.length > 0 ? { description: pendingComments.join(' ') } : {}),
      });
      pendingComments = [];
      continue;
    }
    if (line.startsWith('#') && !line.startsWith('# ---')) {
      pendingComments.push(line.replace(/^#\s?/, ''));
      continue;
    }
    if (line === '') pendingComments = [];
  }

  return serialize({
    $source: '.env.example — regenerate with `pnpm --filter @tessera/docs generate`',
    sections,
  });
}

// --- entry ---------------------------------------------------------------------------------------

/** Generate every artifact; returns { filename → content }. */
export async function generate() {
  const cli = await import(
    pathToFileURL(join(REPO_ROOT, 'apps', 'cli', 'dist', 'index.js')).href
  );
  return {
    'openapi.json': generateOpenapi(),
    'cli-reference.json': await generateCliReference(cli),
    'agent-clients.json': await generateAgentClients(cli),
    'mcp-tools.json': await generateMcpTools(),
    'env-reference.json': generateEnvReference(),
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const artifacts = await generate();
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) {
    writeFileSync(join(OUT_DIR, name), content, 'utf8');
    console.log(`generated/${name}  (${content.length} bytes)`);
  }
}
