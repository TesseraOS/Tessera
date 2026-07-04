#!/usr/bin/env node
/**
 * verify-state.mjs — dependency-free validator for the harness state files and the
 * harness's own integrity invariants (the `state` gate, order 0 — always required).
 *
 * Checks (each section below):
 *   1. effects.json      — schema-shaped links, unique ids, valid refs/origins.
 *   2. feature_list.json — ids unique/well-formed; enums respected; required fields;
 *                          wip_limit honored; blockedBy references exist; effects exist;
 *                          verification tokens are known gate ids; requirements exist in
 *                          the PRD (traceability); active/finished features have their
 *                          blockers done; in-flight features have a committed plan.
 *   3. schema sync       — feature_list.json releases/statuses stay compatible with
 *                          state/schemas/feature_list.schema.json (no dual-maintenance drift).
 *   4. gates.json        — well-formed, unique ids/orders, known statuses; every ACTIVE
 *                          gate is mirrored by a CI step (effect E-005) unless ciStep:false.
 *   5. memory index      — every committed memory entry is listed in memory/index.md.
 *   6. doc links         — every relative markdown link in the governed doc set resolves
 *                          (README/AGENTS/CLAUDE/NOTICE + docs/** + .harness/**).
 *   7. env docs          — every TESSERA_* env var read by config/server is documented in
 *                          .env.example (operators can discover it).
 *
 * Zero npm dependencies so it works pre-toolchain and in any CI. Errors fail (exit 1);
 * warnings are printed but do not fail (historical debt that must not break the gate).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function loadJson(relPath, { optional = false } = {}) {
  const abs = join(root, relPath);
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    if (optional && e.code === 'ENOENT') return null;
    err(relPath, `cannot read/parse JSON — ${e.message}`);
    return null;
  }
}

function loadText(relPath, { optional = false } = {}) {
  try {
    return readFileSync(join(root, relPath), 'utf8');
  } catch (e) {
    if (optional && e.code === 'ENOENT') return null;
    err(relPath, `cannot read — ${e.message}`);
    return null;
  }
}

/** Recursively collect files under a repo-relative dir, filtered by extension. */
function filesUnder(relPath, extension, acc = []) {
  const abs = join(root, relPath);
  let s;
  try {
    s = statSync(abs);
  } catch {
    return acc; // a scan path that doesn't exist yet is not an error
  }
  if (s.isDirectory()) {
    for (const entry of readdirSync(abs)) filesUnder(join(relPath, entry), extension, acc);
  } else if (abs.endsWith(extension)) {
    acc.push(relPath);
  }
  return acc;
}

const SERVICES = ['root', 'api', 'web'];
const PRIORITIES = ['must', 'should', 'could', 'wont'];
const REF_KINDS = [
  'file',
  'symbol',
  'module',
  'package',
  'contract',
  'schema',
  'test',
  'artifact',
  'decision',
  'doc',
];
const ORIGINS = ['static', 'manual', 'learned'];
const GATE_STATUSES = ['pending-toolchain', 'planned', 'active', 'retired'];
const reqRe = /^(FR|NFR)-[0-9]+$/;
const featRe = /^F-[0-9]{3}$/;
const effectRe = /^E-[0-9]{3}$/;

// ---------------------------------------------------------------------------
// 1. effects.json
// ---------------------------------------------------------------------------
const effects = loadJson('.harness/state/effects.json');
const effectIds = new Set();
if (effects) {
  for (const k of ['version', 'updated', 'links']) {
    if (!(k in effects)) err('effects.json', `missing required key "${k}"`);
  }
  if (Array.isArray(effects.links)) {
    effects.links.forEach((l, i) => {
      const at = `effects.links[${i}]`;
      if (!effectRe.test(l.id ?? '')) err(at, `id "${l.id}" must match E-NNN`);
      else if (effectIds.has(l.id)) err(at, `duplicate id ${l.id}`);
      else effectIds.add(l.id);
      if (l.kind !== 'EFFECT_LINK') err(at, `kind must be "EFFECT_LINK"`);
      if (typeof l.rationale !== 'string' || !l.rationale.trim()) err(at, 'rationale required');
      if (typeof l.confidence !== 'number' || l.confidence < 0 || l.confidence > 1)
        err(at, 'confidence must be a number in [0,1]');
      if (!ORIGINS.includes(l.origin)) err(at, `origin must be one of ${ORIGINS.join('|')}`);
      const checkRef = (r, label) => {
        if (!r || !REF_KINDS.includes(r.kind)) err(at, `${label}.kind invalid`);
        if (!r || typeof r.ref !== 'string' || !r.ref.trim()) err(at, `${label}.ref required`);
      };
      checkRef(l.from, 'from');
      if (!Array.isArray(l.to) || l.to.length === 0) err(at, 'to[] must be non-empty');
      else l.to.forEach((r, j) => checkRef(r, `to[${j}]`));
    });
  } else {
    err('effects.json', 'links must be an array');
  }
}

// ---------------------------------------------------------------------------
// 2. gates.json (validated before features so verification tokens can be checked)
// ---------------------------------------------------------------------------
const gates = loadJson('.harness/verification/gates.json');
const gateIds = new Set();
if (gates) {
  if (!Array.isArray(gates.gates) || gates.gates.length === 0) {
    err('gates.json', 'gates must be a non-empty array');
  } else {
    const orders = new Set();
    gates.gates.forEach((g, i) => {
      const at = `gates[${i}] (${g.id ?? '?'})`;
      if (typeof g.id !== 'string' || !g.id.trim()) err(at, 'id required');
      else if (gateIds.has(g.id)) err(at, `duplicate gate id ${g.id}`);
      else gateIds.add(g.id);
      if (!Number.isInteger(g.order)) err(at, 'order must be an integer');
      else if (orders.has(g.order)) err(at, `duplicate order ${g.order}`);
      else orders.add(g.order);
      if (!GATE_STATUSES.includes(g.status))
        err(at, `status must be one of ${GATE_STATUSES.join('|')}`);
      if (typeof g.command !== 'string' || !g.command.trim()) err(at, 'command required');
      if (!Array.isArray(g.requiredFor) || g.requiredFor.length === 0)
        err(at, 'requiredFor must be non-empty');
      if ('ciStep' in g && typeof g.ciStep !== 'boolean') err(at, 'ciStep must be boolean');
    });
  }
}

// CI mirror (effect E-005): every ACTIVE gate must appear as a CI step, unless the gate
// explicitly opts out (ciStep:false, e.g. a11y is asserted inside the web e2e step).
// CI invokes root scripts without the -w flag; accept both spellings.
const ciText = loadText('.github/workflows/ci.yml');
if (gates && ciText && Array.isArray(gates.gates)) {
  for (const g of gates.gates) {
    if (g.status !== 'active' || g.ciStep === false) continue;
    if (typeof g.command !== 'string') continue;
    const spellings = [g.command, g.command.replace('pnpm -w ', 'pnpm ')];
    if (!spellings.some((s) => ciText.includes(s))) {
      err(
        'ci-mirror',
        `active gate "${g.id}" (${g.command}) has no matching step in .github/workflows/ci.yml — CI must mirror gates.json (E-005); set ciStep:false only if another step demonstrably covers it`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. feature_list.json
// ---------------------------------------------------------------------------
const features = loadJson('.harness/state/feature_list.json');

// PRD traceability: every requirement id a feature cites must be defined in the PRD.
const prdText = loadText('docs/PRD.md');
const prdRequirementIds = new Set(
  prdText ? [...prdText.matchAll(/\b(?:FR|NFR)-[0-9]+\b/g)].map((m) => m[0]) : [],
);

if (features) {
  for (const k of ['version', 'project', 'updated', 'policy', 'statuses', 'releases', 'features']) {
    if (!(k in features)) err('feature_list.json', `missing required key "${k}"`);
  }
  const statuses = Array.isArray(features.statuses) ? features.statuses : [];
  const releases = Array.isArray(features.releases) ? features.releases : [];
  const wip = features.policy?.wip_limit ?? 1;
  const ids = new Set();
  const byId = new Map();
  let inProgress = 0;

  (features.features ?? []).forEach((f, i) => {
    const at = `feature ${f.id ?? `#${i}`}`;
    if (!featRe.test(f.id ?? '')) err(at, `id must match F-NNN`);
    else if (ids.has(f.id)) err(at, `duplicate id`);
    else {
      ids.add(f.id);
      byId.set(f.id, f);
    }
    if (typeof f.title !== 'string' || f.title.length < 3) err(at, 'title too short');
    if (!Array.isArray(f.requirements)) err(at, 'requirements[] required');
    else
      f.requirements.forEach((r) => {
        if (!reqRe.test(r)) err(at, `bad requirement ref "${r}"`);
        else if (prdText && !prdRequirementIds.has(r))
          err(at, `requirement "${r}" is not defined anywhere in docs/PRD.md (traceability)`);
      });
    if (!SERVICES.includes(f.service)) err(at, `service must be ${SERVICES.join('|')}`);
    if (!releases.includes(f.release)) err(at, `release "${f.release}" not in releases[]`);
    if (!PRIORITIES.includes(f.priority)) err(at, `priority must be ${PRIORITIES.join('|')}`);
    if (!statuses.includes(f.status)) err(at, `status "${f.status}" not in statuses[]`);
    if (f.status === 'in_progress') inProgress++;
    if (f.effects)
      f.effects.forEach((e) => {
        if (!effectRe.test(e)) err(at, `bad effect ref "${e}"`);
        else if (effects && !effectIds.has(e)) err(at, `effect ${e} not found in effects.json`);
      });
    if (f.verification && gates)
      f.verification.forEach((v) => {
        if (!gateIds.has(v)) err(at, `verification "${v}" is not a gate id in gates.json`);
      });
  });

  // Second pass: relational invariants.
  const planFiles = filesUnder('.harness/plans', '.md').map((p) => p.split(sep).pop());
  (features.features ?? []).forEach((f) => {
    const at = `feature ${f.id}`;
    (f.blockedBy ?? []).forEach((b) => {
      if (!ids.has(b)) {
        err(at, `blockedBy "${b}" is not a known feature`);
        return;
      }
      // A feature may not be worked (or finished) while a blocker is not done.
      if (['in_progress', 'in_review', 'done'].includes(f.status)) {
        const blocker = byId.get(b);
        if (blocker && blocker.status !== 'done')
          err(at, `status "${f.status}" but blocker ${b} is "${blocker.status}" (not done)`);
      }
    });
    // Plan-before-code (golden rule 3): in-flight features must have a committed plan.
    const hasPlan = planFiles.some((name) => name.startsWith(`${f.id}-`));
    if (['in_progress', 'in_review'].includes(f.status) && !hasPlan)
      err(at, `status "${f.status}" but no plan file .harness/plans/${f.id}-*.md (plan before code)`);
    if (f.status === 'done' && !hasPlan)
      warn(at, `done without a plan file in .harness/plans/ (historical debt — do not repeat)`);
  });

  if (inProgress > wip)
    err('feature_list.json', `${inProgress} features in_progress exceeds wip_limit ${wip}`);

  // Schema sync: the JSON Schema must accept what the state file declares (no drift).
  const schema = loadJson('.harness/state/schemas/feature_list.schema.json', { optional: true });
  const featProps = schema?.$defs?.feature?.properties;
  if (featProps) {
    const releaseSchema = featProps.release ?? {};
    if (Array.isArray(releaseSchema.enum)) {
      for (const r of releases)
        if (!releaseSchema.enum.includes(r))
          err('schema-sync', `release "${r}" is in feature_list.json releases[] but not in the schema enum`);
    } else if (typeof releaseSchema.pattern === 'string') {
      const re = new RegExp(releaseSchema.pattern);
      for (const r of releases)
        if (!re.test(r)) err('schema-sync', `release "${r}" does not match schema pattern ${releaseSchema.pattern}`);
    }
    const statusSchema = featProps.status ?? {};
    if (Array.isArray(statusSchema.enum)) {
      for (const s of statuses)
        if (!statusSchema.enum.includes(s))
          err('schema-sync', `status "${s}" is in feature_list.json statuses[] but not in the schema enum`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. memory index — every committed memory entry is discoverable from index.md
// ---------------------------------------------------------------------------
const memoryIndex = loadText('.harness/memory/index.md', { optional: true });
if (memoryIndex) {
  for (const kind of ['decisions', 'lessons', 'architecture', 'glossary']) {
    for (const rel of filesUnder(join('.harness/memory', kind), '.md')) {
      const name = rel.split(sep).pop();
      if (!memoryIndex.includes(`${kind}/${name}`))
        err('memory-index', `${kind}/${name} exists but is not listed in .harness/memory/index.md`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. doc links — relative markdown links in the governed doc set must resolve
// ---------------------------------------------------------------------------
const GOVERNED_DOCS = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'NOTICE.md',
  ...filesUnder('docs', '.md'),
  ...filesUnder('.harness', '.md'),
];
const LINK_RE = /\]\(<?([^)\s>#]+)(?:#[^)]*)?>?\)/g;
let linksChecked = 0;
for (const relFile of GOVERNED_DOCS) {
  const text = loadText(relFile, { optional: true });
  if (text === null) continue;
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[1];
    if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
    linksChecked++;
    const targetAbs = resolve(join(root, dirname(relFile)), target);
    if (!existsSync(targetAbs)) err('doc-links', `${relFile} → broken relative link "${target}"`);
  }
}

// ---------------------------------------------------------------------------
// 6. env docs — every TESSERA_* env var read by config/server is in .env.example
// ---------------------------------------------------------------------------
const ENV_SCAN = ['packages/config/src/load.ts', 'apps/server/src'];
const ENV_TOKEN = /\bTESSERA_[A-Z0-9_]+\b/g;

const usedEnv = new Map(); // token -> first file that uses it
for (const scan of ENV_SCAN) {
  for (const rel of filesUnder(scan, '.ts')) {
    if (rel.endsWith('.test.ts')) continue;
    const text = loadText(rel);
    if (text === null) continue;
    for (const m of text.matchAll(ENV_TOKEN)) {
      if (!usedEnv.has(m[0])) usedEnv.set(m[0], rel);
    }
  }
}

const envExample = loadText('.env.example');
if (envExample !== null) {
  const documented = new Set([...envExample.matchAll(ENV_TOKEN)].map((m) => m[0]));
  for (const [token, file] of [...usedEnv].sort()) {
    if (!documented.has(token)) {
      err('env-docs', `${token} (used in ${file.replaceAll(sep, '/')}) is not documented in .env.example`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (warnings.length) {
  console.warn(`\n! ${warnings.length} warning(s) (non-fatal):`);
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length) {
  console.error(`\n✗ state invalid — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const fc = features?.features?.length ?? 0;
const ec = effects?.links?.length ?? 0;
console.log(
  `✓ state valid — ${fc} features, ${ec} effect-links, wip_limit ${features?.policy?.wip_limit}; ` +
    `${gateIds.size} gates CI-mirrored, ${linksChecked} doc links, env-docs ok`,
);
process.exit(0);
