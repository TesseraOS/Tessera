import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * COMPOSE DRIFT GATE (extends ADR-0054 §4 / effect-link E-026 to one more machine fact):
 * the self-hosting page shows the repository's `docker-compose.yml` as a fenced YAML
 * block. It is the one deployment fact on the docs site that is authored inline rather
 * than emitted by `generate.mjs` — kept in the MDX so it survives verbatim into
 * `llms-full.txt` and keeps the filename chip / syntax highlighting (a server component
 * rendering a string would lose both). To stop it drifting like a hand-copied block, this
 * test asserts the fenced block is byte-identical to the compose file's body.
 *
 * The compose file carries a leading comment header (internal F-023 / FR-51 references)
 * that the public page intentionally omits; everything from the first non-comment line
 * onward — the entire service + volume definition — must match exactly. If this fails,
 * the compose service definition changed without the doc following it (or vice versa):
 * reconcile the two, do not silence the gate.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');

const COMPOSE_PATH = join(REPO_ROOT, 'docker-compose.yml');
const DOC_PATH = join(APP_ROOT, 'content', 'docs', 'deployment', 'self-host-docker.mdx');

/** Normalize line endings and drop trailing blank lines for a stable comparison. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

/** The compose file with its leading comment/blank header block stripped. */
function composeBody(raw: string): string {
  const lines = normalize(raw).split('\n');
  let start = 0;
  while (start < lines.length && (lines[start].trim() === '' || lines[start].trimStart().startsWith('#'))) {
    start += 1;
  }
  return lines.slice(start).join('\n');
}

/** The contents of the ```yaml title="docker-compose.yml" fence in the MDX page. */
function docFencedBlock(mdx: string): string {
  const match = /```yaml title="docker-compose\.yml"\n([\s\S]*?)\n```/.exec(normalize(mdx));
  if (match === null) {
    throw new Error(
      'no ```yaml title="docker-compose.yml" fence found in self-host-docker.mdx — ' +
        'the compose block was renamed or removed; update this drift gate',
    );
  }
  return match[1];
}

describe('self-host-docker compose block is current', () => {
  it('matches the repository docker-compose.yml body byte-for-byte', () => {
    const expected = composeBody(readFileSync(COMPOSE_PATH, 'utf8'));
    const actual = docFencedBlock(readFileSync(DOC_PATH, 'utf8'));
    expect(
      actual,
      'the docker-compose.yml block in content/docs/deployment/self-host-docker.mdx is stale — ' +
        'reconcile it with the repository-root docker-compose.yml (service definition changed)',
    ).toBe(expected);
  });
});
