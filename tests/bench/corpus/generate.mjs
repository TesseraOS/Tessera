// The versioned benchmark corpus (F-049, NFR-4).
//
// The corpus is GENERATED, not committed: hundreds of lorem files would be repo noise, and what
// actually has to be stable for results to be comparable is the *generator + seed + version* — which
// is committed. Same CORPUS_VERSION ⇒ byte-identical corpus ⇒ comparable numbers, on any machine.
//
// Bump CORPUS_VERSION whenever the shape changes (size, mix, content), so an older report is *visibly*
// incomparable rather than quietly misleading.
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Bump on ANY change to the generated shape. Reports record it; a mismatch invalidates comparison. */
export const CORPUS_VERSION = 1;

/**
 * Fixed mtimes (2026-01-01T00:00:00Z, one second apart per file).
 *
 * Content alone is not enough to make a corpus deterministic: ingestion records each file's mtime, the
 * **temporal retriever** ranks on it, and fusion is rank-based — so real wall-clock mtimes let the
 * ranked set shuffle between runs, which moved tokens-per-answer by ~10% run to run. Pinning mtimes
 * pins the temporal ranks, and with them the whole fused result.
 */
const MTIME_EPOCH_SECONDS = Date.UTC(2026, 0, 1) / 1000;

/** Corpus shape — deliberately modest: big enough to be a real index, small enough to stay fast. */
export const CORPUS_SHAPE = Object.freeze({
  modules: 120,
  docs: 30,
  /** Each module imports this many earlier modules — gives the graph real edges to traverse. */
  importsPerModule: 2,
});

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Seeded, so the corpus is identical
 * everywhere; inlined rather than a dependency because a benchmark's inputs must never drift with a
 * transitive upgrade.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOUNS = [
  'ledger',
  'quernstone',
  'beacon',
  'harbor',
  'lattice',
  'cinder',
  'meridian',
  'foundry',
];
const VERBS = ['reconcile', 'compact', 'materialize', 'validate', 'project', 'anneal'];
const TOPICS = ['retention', 'isolation', 'provenance', 'compaction', 'traversal', 'budgeting'];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** A code module with real imports, exported symbols, and prose comments. */
function moduleSource(rand, index, imports) {
  const noun = pick(rand, NOUNS);
  const verb = pick(rand, VERBS);
  const topic = pick(rand, TOPICS);
  const importLines = imports
    .map(
      (target) =>
        `import { ${camel(NOUNS[target % NOUNS.length])}${target} } from './mod-${target}.js';`,
    )
    .join('\n');
  const uses = imports
    .map((target) => `${camel(NOUNS[target % NOUNS.length])}${target}(input)`)
    .join(' + ');

  return `${importLines}

/**
 * Module ${index} — ${verb}s the ${noun} for ${topic}. Part of the benchmark corpus; the prose exists so
 * keyword and semantic retrieval have something real to score, not just identifiers.
 */
export interface ${pascal(noun)}${index}Input {
  readonly id: string;
  readonly amount: number;
}

/** ${pascal(verb)} the ${noun} (${topic}). */
export function ${camel(noun)}${index}(input: ${pascal(noun)}${index}Input): number {
  const base = input.amount * ${index % 7 || 1};
  return ${uses === '' ? 'base' : `base + ${uses.replaceAll('(input)', '({ id: input.id, amount: base })')}`};
}
`;
}

/** A prose document — the retrieval corpus is not all code. */
function docSource(rand, index) {
  const noun = pick(rand, NOUNS);
  const topic = pick(rand, TOPICS);
  const paragraphs = Array.from({ length: 4 }, () => {
    const sentences = Array.from(
      { length: 4 },
      () =>
        `The ${pick(rand, NOUNS)} ${pick(rand, VERBS)}s the ${pick(rand, NOUNS)} so ${pick(rand, TOPICS)} stays predictable.`,
    );
    return sentences.join(' ');
  });

  return `# ${pascal(noun)} ${index}: ${topic}

${paragraphs.join('\n\n')}

## Decision

We ${pick(rand, VERBS)} the ${noun} rather than rebuild it, because ${topic} must survive a restart.
`;
}

const camel = (word) => word;
const pascal = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Write the corpus into `root`. Returns the manifest (version + shape + file count) that the report
 * records, so a number can always be traced to the corpus it was measured on.
 */
export function generateCorpus(root) {
  const rand = mulberry32(0x7e55e2a); // fixed seed — the whole point
  let files = 0;

  const write = (relative, content) => {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    // Deterministic mtime, spaced one second apart in write order (see MTIME_EPOCH_SECONDS).
    const stamp = MTIME_EPOCH_SECONDS + files;
    utimesSync(target, stamp, stamp);
    files += 1;
  };

  for (let index = 0; index < CORPUS_SHAPE.modules; index += 1) {
    // Import only EARLIER modules: no cycles, and a realistic dependency fan-in for get_effects.
    const imports = [];
    for (let n = 0; n < CORPUS_SHAPE.importsPerModule && index > 0; n += 1) {
      const target = Math.floor(rand() * index);
      if (!imports.includes(target)) imports.push(target);
    }
    write(`src/mod-${index}.ts`, moduleSource(rand, index, imports));
  }

  for (let index = 0; index < CORPUS_SHAPE.docs; index += 1) {
    write(`docs/doc-${index}.md`, docSource(rand, index));
  }

  return { version: CORPUS_VERSION, shape: CORPUS_SHAPE, files };
}
