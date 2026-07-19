import { accessSync, constants, existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { loadConfig, type TesseraConfig } from '@tessera/config';
import { flagBool, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { loadConfigFile } from '../config-file.js';
import { line, type Io } from '../io.js';
import { printJson, renderTable } from '../output.js';

/** Outcome of one health check. `fail` → non-zero exit; `warn` is advisory; `ok` is healthy. */
type CheckStatus = 'ok' | 'warn' | 'fail';

interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

/** The supported Node range (mirrors the root `package.json` engines: `>=22.16.0 <23`). */
const NODE_MIN = { major: 22, minor: 16 } as const;

function checkNode(current: string): Check {
  const [major = 0, minor = 0] = current.split('.').map((part) => Number.parseInt(part, 10));
  if (major < NODE_MIN.major || (major === NODE_MIN.major && minor < NODE_MIN.minor)) {
    return { name: 'node', status: 'fail', detail: `${current} — requires >=22.16.0 <23` };
  }
  if (major >= 23) {
    return {
      name: 'node',
      status: 'warn',
      detail: `${current} — newer than the tested range (<23)`,
    };
  }
  return { name: 'node', status: 'ok', detail: current };
}

/** The nearest existing ancestor of `dir` (so we can tell whether `init` could create the data dir). */
function nearestExisting(dir: string): string {
  let current = dir;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function isWritable(dir: string): boolean {
  try {
    accessSync(nearestExisting(dir), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function abs(io: Io, path: string): string {
  return isAbsolute(path) ? path : resolve(io.cwd, path);
}

function checkStorage(io: Io, config: TesseraConfig): Check {
  const targets: string[] = [];
  if (config.storage.sqlitePath !== ':memory:')
    targets.push(dirname(abs(io, config.storage.sqlitePath)));
  if (config.storage.vectorPath !== ':memory:')
    targets.push(dirname(abs(io, config.storage.vectorPath)));
  targets.push(abs(io, config.storage.blobRoot));

  const unwritable = targets.filter((dir) => !isWritable(dir));
  if (unwritable.length > 0) {
    return { name: 'storage', status: 'fail', detail: `not writable: ${unwritable.join(', ')}` };
  }
  const memory = config.storage.sqlitePath === ':memory:' ? ' (sqlite in-memory)' : '';
  return { name: 'storage', status: 'ok', detail: `${config.storage.blobRoot}${memory}` };
}

/** Best-effort embeddings check. Never blocks long: `ollama` is pinged with a short timeout. */
async function checkEmbeddings(config: TesseraConfig): Promise<Check> {
  const { provider, model, ollamaUrl } = config.embeddings;
  if (provider === 'fake') {
    return { name: 'embeddings', status: 'ok', detail: 'fake (test embeddings)' };
  }
  if (provider === 'transformers') {
    const suffix = model !== undefined ? ` (${model})` : '';
    return {
      name: 'embeddings',
      status: 'ok',
      detail: `transformers${suffix} — local model, downloads on first scan`,
    };
  }
  // provider === 'ollama'
  const base = ollamaUrl ?? 'http://127.0.0.1:11434';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`${base}/api/tags`, { signal: controller.signal });
    return response.ok
      ? { name: 'embeddings', status: 'ok', detail: `ollama reachable at ${base}` }
      : {
          name: 'embeddings',
          status: 'warn',
          detail: `ollama at ${base} returned ${response.status}`,
        };
  } catch {
    return { name: 'embeddings', status: 'warn', detail: `ollama not reachable at ${base}` };
  } finally {
    clearTimeout(timer);
  }
}

async function runDoctor(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['json'] });
  const json = flagBool(args, 'json');
  const checks: Check[] = [checkNode(process.versions.node)];

  // Config: load the file (if any) + validate through the schema. A failure here is fatal for the
  // dependent checks, so we record it and report the rest as skipped rather than crash.
  const { input, path } = loadConfigFile(io, flagStr(args, 'config'));
  let config: TesseraConfig | undefined;
  try {
    config = loadConfig(io.env, input);
    checks.push({
      name: 'config',
      status: 'ok',
      detail: `${path ?? 'defaults'} — profile ${config.profile}, auth ${config.auth.mode}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'config', status: 'fail', detail: message });
  }

  if (config !== undefined) {
    checks.push(checkStorage(io, config));
    checks.push(await checkEmbeddings(config));
  } else {
    checks.push({ name: 'storage', status: 'warn', detail: 'skipped (config invalid)' });
    checks.push({ name: 'embeddings', status: 'warn', detail: 'skipped (config invalid)' });
  }

  const failed = checks.some((check) => check.status === 'fail');

  if (json) {
    printJson(io, { ok: !failed, checks });
  } else {
    const marks: Record<CheckStatus, string> = { ok: '✓', warn: '!', fail: '✗' };
    line(
      io,
      renderTable(checks.map((c) => ({ label: `${marks[c.status]} ${c.name}`, value: c.detail }))),
    );
    line(io, '');
    line(io, failed ? 'doctor: problems found.' : 'doctor: all checks passed.');
  }

  return failed ? 1 : 0;
}

export const doctorCommand: Command = {
  name: 'doctor',
  summary: 'Check node, config, storage, and embeddings health.',
  usage: [
    'Usage: tessera doctor [--config <path>] [--json]',
    '',
    'Runs read-only health checks and exits non-zero if any fails:',
    '  node        the running Node version is in the supported range (>=22.16.0 <23)',
    '  config      tessera.config.json (or --config) loads and validates',
    '  storage     the sqlite/blob data directories are writable',
    '  embeddings  the configured provider is usable (ollama is pinged briefly)',
  ].join('\n'),
  run: runDoctor,
};
