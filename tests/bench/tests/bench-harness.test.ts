import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// The harness is plain .mjs (scripts, not a library); `allowJs` infers both cleanly, so no suppression
// is needed — and an unused @ts-expect-error would itself fail typecheck.
import { CORPUS_VERSION, generateCorpus } from '../corpus/generate.mjs';
import { percentile } from '../stats.mjs';

/**
 * The harness's own correctness (F-049). A benchmark whose maths or inputs are wrong reports confident
 * nonsense, so the two things it stands on — a deterministic corpus and honest percentile maths — are
 * asserted here, in the standard `test` gate.
 */

const created: string[] = [];
afterEach(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
});

function corpusInto(): { root: string; manifest: { version: number; files: number } } {
  const root = mkdtempSync(join(tmpdir(), 'bench-corpus-test-'));
  created.push(root);
  return { root, manifest: generateCorpus(root) as { version: number; files: number } };
}

/** A stable fingerprint of every generated file (path + content), order-independent. */
function corpusHash(root: string): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else
        files.push(
          `${full.slice(root.length).replaceAll('\\', '/')}\n${readFileSync(full, 'utf8')}`,
        );
    }
  };
  walk(root);
  return createHash('sha256').update(files.join('\0')).digest('hex');
}

describe('benchmark corpus', () => {
  it('is byte-identical across runs — the whole basis for comparing numbers', () => {
    const a = corpusInto();
    const b = corpusInto();
    expect(corpusHash(a.root)).toBe(corpusHash(b.root));
  });

  it('reports a version and the file count it actually wrote', () => {
    const { root, manifest } = corpusInto();
    expect(manifest.version).toBe(CORPUS_VERSION);
    let counted = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else counted += 1;
      }
    };
    walk(root);
    expect(manifest.files).toBe(counted);
  });

  it('generates a corpus big enough to be a real index', () => {
    // A handful of files would make every latency ~0 and the gate meaningless.
    expect(corpusInto().manifest.files).toBeGreaterThan(100);
  });
});

describe('percentile', () => {
  it('uses nearest-rank — it always returns an observed value', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(samples, 0.95)).toBe(100);
    expect(percentile(samples, 0.5)).toBe(50);
    // Never interpolates into a value that was never measured.
    expect(samples).toContain(percentile(samples, 0.9));
  });

  it('is order-independent and handles a single sample', () => {
    expect(percentile([50, 10, 90, 30], 0.5)).toBe(percentile([90, 30, 10, 50], 0.5));
    expect(percentile([42], 0.95)).toBe(42);
  });

  it('rejects an empty sample set rather than inventing a number', () => {
    expect(() => percentile([], 0.95)).toThrow(/empty/);
  });
});
