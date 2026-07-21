/**
 * The skills registry pipeline (F-054; ADR-0036 §3). `registry/<name>/SKILL.md` is the ONE source
 * of truth; this script parses + validates every skill and emits the committed modules under
 * `src/generated/`:
 *
 *   pnpm --filter @tessera/skills generate
 *
 *   registry/<name>/SKILL.md  →  src/generated/catalog.ts    (manifests only — no bodies)
 *                             →  src/generated/documents.ts  (the exact file bytes)
 *
 * WHY a generated module rather than reading the markdown at runtime: the consumers are a Next
 * static build (apps/marketing), a published CLI, and the MCP server. A plain `import` works
 * identically in all three, ships only `dist/`, and keeps this package at ZERO runtime
 * dependencies. The cost — generated files can go stale — is paid by `src/registry.test.ts`,
 * which regenerates in the standard `test` gate and asserts byte-identity. Stale data is a red
 * build, not a support ticket.
 *
 * Validation is deliberately strict and fails LOUDLY with the offending file named: a malformed
 * skill must never reach an agent's skills directory. `yaml` is a devDependency (build-time only).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const REGISTRY_DIR = join(PACKAGE_ROOT, 'registry');

/** Kept in step with SKILL_CATEGORIES in src/types.ts (asserted by the test suite). */
const CATEGORIES = ['workflow', 'setup'];

// Spec limits — https://agentskills.io/specification
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_FRONTMATTER_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata'];

// House limits on top of the spec.
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const TOOL_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_HEADLINE_WORDS = 8;
/** The spec recommends keeping SKILL.md under 500 lines; 400 leaves headroom for growth. */
const MAX_BODY_LINES = 400;
const REQUIRED_METADATA_KEYS = [
  'tessera.version',
  'tessera.category',
  'tessera.headline',
  'tessera.why',
  'tessera.tools',
];

/** Every skill directory, sorted — the directory name IS the skill name (spec requirement). */
function skillDirectories() {
  const names = readdirSync(REGISTRY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) {
    throw new Error(`${REGISTRY_DIR}: no skills found — the registry must not be empty`);
  }
  return names;
}

/**
 * Read one SKILL.md as text, normalizing CRLF→LF. Without this a Windows checkout would generate
 * different bytes than CI and redden the drift gate for a reason unrelated to any change.
 */
function readDocument(name) {
  const source = join(REGISTRY_DIR, name, 'SKILL.md');
  return readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
}

/** Split the YAML frontmatter from the Markdown body, refusing anything malformed. */
function splitFrontmatter(document, source) {
  if (!document.startsWith('---\n')) {
    throw new Error(`${source}: must open with a YAML frontmatter fence ("---" on line 1)`);
  }
  const end = document.indexOf('\n---\n', 3);
  if (end === -1) {
    throw new Error(`${source}: the frontmatter fence is never closed (expected a "---" line)`);
  }
  return { frontmatter: document.slice(4, end + 1), body: document.slice(end + 5) };
}

function requireString(value, label, source) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${source}: ${label} must be a non-empty string`);
  }
  return value;
}

/** Parse + fully validate one skill. Throws with the file named on the first problem. */
export function parseSkill(name, document) {
  const source = `registry/${name}/SKILL.md`;
  const { frontmatter, body } = splitFrontmatter(document, source);

  let parsed;
  try {
    // uniqueKeys: a duplicate key silently overwriting its twin is exactly the mis-parse this
    // validation exists to prevent.
    parsed = parse(frontmatter, { uniqueKeys: true });
  } catch (error) {
    throw new Error(`${source}: frontmatter is not valid YAML — ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${source}: frontmatter must be a YAML mapping`);
  }

  const unknown = Object.keys(parsed).filter((key) => !ALLOWED_FRONTMATTER_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${source}: unknown frontmatter key(s) ${unknown.join(', ')} — allowed: ${ALLOWED_FRONTMATTER_KEYS.join(', ')}`,
    );
  }

  // --- spec fields ---------------------------------------------------------------------------
  const declaredName = requireString(parsed.name, 'name', source);
  if (declaredName !== name) {
    throw new Error(`${source}: name "${declaredName}" must match its directory "${name}"`);
  }
  if (declaredName.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(declaredName)) {
    throw new Error(
      `${source}: name must be <=${MAX_NAME_LENGTH} chars of lowercase alphanumerics and single hyphens`,
    );
  }

  const description = requireString(parsed.description, 'description', source).trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`${source}: description exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  // Required here although the spec makes it optional: every Tessera skill needs a connected MCP
  // server, and an agent that installs one without that stated will simply watch it fail.
  const compatibility = requireString(parsed.compatibility, 'compatibility', source).trim();
  if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
    throw new Error(`${source}: compatibility exceeds ${MAX_COMPATIBILITY_LENGTH} characters`);
  }

  // --- tessera.* metadata --------------------------------------------------------------------
  const metadata = parsed.metadata;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`${source}: metadata must be a mapping of string keys to string values`);
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== 'string') {
      throw new Error(
        `${source}: metadata["${key}"] must be a string (the spec allows string values only)`,
      );
    }
    if (!REQUIRED_METADATA_KEYS.includes(key)) {
      throw new Error(
        `${source}: unknown metadata key "${key}" — allowed: ${REQUIRED_METADATA_KEYS.join(', ')}`,
      );
    }
  }
  for (const key of REQUIRED_METADATA_KEYS) {
    if (typeof metadata[key] !== 'string' || metadata[key].trim() === '') {
      throw new Error(`${source}: metadata["${key}"] is required and must be a non-empty string`);
    }
  }

  const version = metadata['tessera.version'].trim();
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`${source}: tessera.version "${version}" must be semver (e.g. 1.0.0)`);
  }

  const category = metadata['tessera.category'].trim();
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      `${source}: tessera.category "${category}" is not one of ${CATEGORIES.join(', ')}`,
    );
  }

  const headline = metadata['tessera.headline'].trim();
  const headlineWords = headline.split(/\s+/).length;
  if (headlineWords > MAX_HEADLINE_WORDS) {
    throw new Error(
      `${source}: tessera.headline is ${headlineWords} words — keep it to ${MAX_HEADLINE_WORDS} or fewer`,
    );
  }

  const why = metadata['tessera.why'].trim();

  const tools = metadata['tessera.tools']
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool !== '');
  if (tools.length === 0) {
    throw new Error(`${source}: tessera.tools must name at least one MCP tool`);
  }
  for (const tool of tools) {
    if (!TOOL_PATTERN.test(tool)) {
      throw new Error(`${source}: tessera.tools entry "${tool}" is not a valid tool name`);
    }
    // A manifest that advertises a tool the instructions never mention is stale, and an agent
    // reading the catalog would be misled about what the skill actually teaches.
    if (!body.includes(tool)) {
      throw new Error(`${source}: tessera.tools names "${tool}" but the body never mentions it`);
    }
  }
  if (new Set(tools).size !== tools.length) {
    throw new Error(`${source}: tessera.tools contains duplicates`);
  }

  // --- body ------------------------------------------------------------------------------------
  if (body.trim() === '') {
    throw new Error(`${source}: the Markdown body is empty`);
  }
  const bodyLines = body.split('\n').length;
  if (bodyLines > MAX_BODY_LINES) {
    throw new Error(
      `${source}: body is ${bodyLines} lines — keep it under ${MAX_BODY_LINES} (progressive disclosure)`,
    );
  }

  return {
    name: declaredName,
    description,
    version,
    category,
    headline,
    why,
    tools,
    compatibility,
  };
}

/** Parse every skill in the registry. Returns manifests (sorted by name) + their exact documents. */
export function loadRegistry() {
  const manifests = [];
  const documents = {};
  for (const name of skillDirectories()) {
    const document = readDocument(name);
    manifests.push(parseSkill(name, document));
    documents[name] = document;
  }
  return { manifests, documents };
}

const BANNER = `// GENERATED by scripts/generate.mjs — DO NOT EDIT.
// Source of truth: registry/<name>/SKILL.md. Regenerate with:
//   pnpm --filter @tessera/skills generate
`;

function renderCatalog(manifests) {
  const entries = manifests
    .map((manifest) =>
      [
        '  {',
        `    name: ${JSON.stringify(manifest.name)},`,
        `    description: ${JSON.stringify(manifest.description)},`,
        `    version: ${JSON.stringify(manifest.version)},`,
        `    category: ${JSON.stringify(manifest.category)},`,
        `    headline: ${JSON.stringify(manifest.headline)},`,
        `    why: ${JSON.stringify(manifest.why)},`,
        `    tools: [${manifest.tools.map((tool) => JSON.stringify(tool)).join(', ')}],`,
        `    compatibility: ${JSON.stringify(manifest.compatibility)},`,
        '  },',
      ].join('\n'),
    )
    .join('\n');
  return `${BANNER}
import type { SkillManifest } from '../types.js';

/** Every first-party skill's manifest, sorted by name. Bodies live in \`./documents.ts\`. */
export const SKILLS = [
${entries}
] as const satisfies readonly SkillManifest[];

/** The skill names as a non-empty tuple — feeds \`z.enum\` so the MCP tool schema IS the catalog. */
export const SKILL_NAMES = [${manifests.map((manifest) => JSON.stringify(manifest.name)).join(', ')}] as const;
`;
}

function renderDocuments(documents) {
  const entries = Object.entries(documents)
    .map(([name, document]) => `  ${JSON.stringify(name)}: ${JSON.stringify(document)},`)
    .join('\n');
  return `${BANNER}
/** The exact \`SKILL.md\` bytes for each skill — what every install path writes to disk. */
export const SKILL_DOCUMENTS: Readonly<Record<string, string>> = {
${entries}
};
`;
}

/** Generate every artifact; returns { package-root-relative path → content }. */
export function generate() {
  const { manifests, documents } = loadRegistry();
  return {
    'src/generated/catalog.ts': renderCatalog(manifests),
    'src/generated/documents.ts': renderDocuments(documents),
  };
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  for (const [name, content] of Object.entries(generate())) {
    const target = join(PACKAGE_ROOT, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    console.log(`${name}  (${content.length} bytes)`);
  }
}
