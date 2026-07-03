#!/usr/bin/env node
/**
 * verify-state.mjs — dependency-free validator for the harness state files.
 *
 * Validates .harness/state/feature_list.json and effects.json against the rules encoded
 * in their JSON Schemas (state/schemas/*.json), plus cross-file invariants:
 *   - ids unique and well-formed; enums respected; required fields present
 *   - wip_limit honored (at most N features 'in_progress')
 *   - every blockedBy points to a real feature
 *   - every feature.effects id exists in effects.json
 *   - every TESSERA_* env var read by config/server is documented in .env.example (env-docs guard)
 *
 * This runs with zero npm dependencies so it works pre-toolchain. The JSON Schemas remain
 * the formal contract for CI (ajv) later. Exit code 0 = valid, 1 = invalid.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const FEATURES = new URL('.harness/state/feature_list.json', root);
const EFFECTS = new URL('.harness/state/effects.json', root);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function load(url) {
  const path = fileURLToPath(url);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(path, `cannot read/parse JSON — ${e.message}`);
    return null;
  }
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
const reqRe = /^(FR|NFR)-[0-9]+$/;
const featRe = /^F-[0-9]{3}$/;
const effectRe = /^E-[0-9]{3}$/;

const features = load(FEATURES);
const effects = load(EFFECTS);

// ---- effects.json ----
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

// ---- feature_list.json ----
if (features) {
  for (const k of ['version', 'project', 'updated', 'policy', 'statuses', 'releases', 'features']) {
    if (!(k in features)) err('feature_list.json', `missing required key "${k}"`);
  }
  const statuses = Array.isArray(features.statuses) ? features.statuses : [];
  const releases = Array.isArray(features.releases) ? features.releases : [];
  const wip = features.policy?.wip_limit ?? 1;
  const ids = new Set();
  let inProgress = 0;

  (features.features ?? []).forEach((f, i) => {
    const at = `feature ${f.id ?? `#${i}`}`;
    if (!featRe.test(f.id ?? '')) err(at, `id must match F-NNN`);
    else if (ids.has(f.id)) err(at, `duplicate id`);
    else ids.add(f.id);
    if (typeof f.title !== 'string' || f.title.length < 3) err(at, 'title too short');
    if (!Array.isArray(f.requirements)) err(at, 'requirements[] required');
    else
      f.requirements.forEach((r) => {
        if (!reqRe.test(r)) err(at, `bad requirement ref "${r}"`);
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
  });

  // second pass: blockedBy references
  (features.features ?? []).forEach((f) => {
    (f.blockedBy ?? []).forEach((b) => {
      if (!ids.has(b)) err(`feature ${f.id}`, `blockedBy "${b}" is not a known feature`);
    });
  });

  if (inProgress > wip)
    err('feature_list.json', `${inProgress} features in_progress exceeds wip_limit ${wip}`);
}

// ---- env-docs guard ----
// Every TESSERA_* env var the config loader + the server read MUST be documented in .env.example,
// so operators can discover it. We keep missing this by hand; the state gate now enforces it.
// Scan source (the authoritative env→config mapping + the server), collect TESSERA_* tokens, and
// require each to appear in .env.example (commented example lines count as documented).
const ENV_SCAN = ['packages/config/src/load.ts', 'apps/server/src'];
const ENV_TOKEN = /\bTESSERA_[A-Z0-9_]+\b/g;

function tsFiles(relPath, acc = []) {
  const abs = fileURLToPath(new URL(relPath, root));
  let s;
  try {
    s = statSync(abs);
  } catch {
    return acc; // a scan path that doesn't exist yet is not an error
  }
  if (s.isDirectory()) {
    for (const entry of readdirSync(abs)) tsFiles(`${relPath}/${entry}`, acc);
  } else if (abs.endsWith('.ts') && !abs.endsWith('.test.ts')) {
    acc.push(abs);
  }
  return acc;
}

const usedEnv = new Map(); // token -> first file that uses it
for (const scan of ENV_SCAN) {
  for (const file of tsFiles(scan)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(ENV_TOKEN)) {
      if (!usedEnv.has(m[0])) usedEnv.set(m[0], file);
    }
  }
}

let documentedEnv = null;
try {
  const exampleText = readFileSync(fileURLToPath(new URL('.env.example', root)), 'utf8');
  documentedEnv = new Set([...exampleText.matchAll(ENV_TOKEN)].map((m) => m[0]));
} catch {
  err('env-docs', '.env.example is missing or unreadable');
}
if (documentedEnv) {
  for (const [token, file] of [...usedEnv].sort()) {
    if (!documentedEnv.has(token)) {
      const rel = file.slice(fileURLToPath(root).length).replace(/\\/g, '/');
      err('env-docs', `${token} (used in ${rel}) is not documented in .env.example`);
    }
  }
}

// ---- report ----
if (errors.length) {
  console.error(`\n✗ state invalid — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const fc = features?.features?.length ?? 0;
const ec = effects?.links?.length ?? 0;
console.log(
  `✓ state valid — ${fc} features, ${ec} effect-links, wip_limit ${features?.policy?.wip_limit}`,
);
process.exit(0);
