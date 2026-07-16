import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What `support/full-stack-server.mjs` publishes about the live deployment under test. */
export interface Handoff {
  /** Base URL of the real API, e.g. `http://127.0.0.1:3200`. */
  readonly apiUrl: string;
  /** An owner token for {@link Handoff.tenantId}, issued by the real token store. */
  readonly token: string;
  readonly tenantId: string;
  /** The registered fixture source. */
  readonly sourceId: string;
  /** The temp data dir holding the deployment's SQLite files + blobs. */
  readonly dataDir: string;
  readonly fixtureRoot: string;
  readonly scanSummary: { added: number; modified: number; removed: number; unchanged: number };
  /** The exact `TESSERA_*` env a second process needs to attach to this same deployment. */
  readonly env: Record<string, string>;
}

/**
 * Read the live deployment's handoff. Playwright starts the specs only after the server's `webServer`
 * health check passes, and the file is written before the server listens, so this is always present by
 * the time a test runs — a missing file means the server died, and the thrown error says so.
 */
export function readHandoff(): Handoff {
  const path = join(packageRoot, '.tmp', 'handoff.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Handoff;
  } catch (cause) {
    throw new Error(
      `no e2e-full handoff at ${path} — the real server failed to boot or to scan the fixture; check its output`,
      { cause },
    );
  }
}

/** The term that appears ONLY in the fixture corpus, so a hit can't be incidental. */
export const FIXTURE_TERM = 'quernstone';
