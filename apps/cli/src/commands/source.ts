import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '@tessera/config';
import { createServerRuntime } from '@tessera/server';
import { flagBool, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { loadConfigFile } from '../config-file.js';
import { CliError } from '../errors.js';
import { errline, line, type Io } from '../io.js';
import { printJson } from '../output.js';

const execFileAsync = promisify(execFile);

/** A target is a remote to clone when it looks like a git URL; otherwise it is a local path. */
function isRemote(target: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(target) || target.endsWith('.git');
}

/** Derive a filesystem-safe directory name for a cloned repo from its URL. */
function repoName(url: string): string {
  const cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '');
  const last = cleaned.split(/[/:]/).pop() ?? 'repo';
  const safe = last.replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe.length > 0 ? safe : 'repo';
}

interface Resolved {
  readonly kind: string;
  readonly root: string;
}

/** Resolve `<path|git-url>` to a `{kind, root}` register input, cloning a remote into the data dir. */
async function resolveTarget(
  io: Io,
  target: string,
  dataDir: string,
  kindOverride: string | undefined,
): Promise<Resolved> {
  if (isRemote(target)) {
    const sourcesRoot = join(dataDir, 'sources');
    mkdirSync(sourcesRoot, { recursive: true });
    const cloneDir = join(sourcesRoot, repoName(target));
    if (existsSync(cloneDir)) {
      throw new CliError(`clone target already exists: ${cloneDir}`, {
        hint: 'remove it, or add the existing checkout as a local path',
      });
    }
    errline(io, `Cloning ${target} …`);
    try {
      await execFileAsync('git', ['clone', '--depth', '1', target, cloneDir]);
    } catch (error) {
      throw new CliError(`git clone failed for ${target}`, {
        cause: error,
        hint: 'check the URL and that git is installed and on PATH',
      });
    }
    return { kind: kindOverride ?? 'git', root: cloneDir };
  }

  const root = isAbsolute(target) ? target : resolve(io.cwd, target);
  if (!existsSync(root)) {
    throw new CliError(`path not found: ${root}`);
  }
  const kind = kindOverride ?? (existsSync(join(root, '.git')) ? 'git' : 'filesystem');
  return { kind, root };
}

async function addSource(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['json', 'no-scan'] });
  const json = flagBool(args, 'json');

  const target = args.positionals[0];
  if (target === undefined) {
    throw new CliError('source add needs a <path|git-url>', {
      hint: 'e.g. tessera source add ./my-repo   or   tessera source add https://github.com/org/repo.git',
    });
  }

  const { input } = loadConfigFile(io, flagStr(args, 'config'));
  const config = loadConfig(io.env, input);
  const dataDir = dirname(
    isAbsolute(config.storage.blobRoot)
      ? config.storage.blobRoot
      : resolve(io.cwd, config.storage.blobRoot),
  );

  const resolved = await resolveTarget(io, target, dataDir, flagStr(args, 'kind'));
  const label = flagStr(args, 'label');

  const runtime = await createServerRuntime({ env: io.env, config: input });
  try {
    const source = await runtime.sources.register({
      kind: resolved.kind,
      config: { root: resolved.root },
      ...(label !== undefined ? { label } : {}),
    });

    const summary = flagBool(args, 'no-scan')
      ? undefined
      : (await runtime.sources.scan(source.id)).summary;

    if (json) {
      printJson(io, {
        id: source.id,
        kind: source.kind,
        label: source.label,
        ...(summary !== undefined ? { summary } : {}),
      });
    } else {
      line(io, `Registered source ${source.id} (${source.kind}) — ${source.label}`);
      if (summary !== undefined) {
        line(
          io,
          `Scanned: +${summary.added} ~${summary.modified} -${summary.removed} (${summary.unchanged} unchanged)`,
        );
      } else {
        line(
          io,
          "Skipped scan (--no-scan). Run 'tessera serve' and scan via /v1/sources/:id/scan.",
        );
      }
    }
    return 0;
  } finally {
    await runtime.close();
  }
}

async function runSource(io: Io, argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  if (sub === 'add') return addSource(io, argv.slice(1));
  if (sub === undefined) {
    errline(io, "error: missing subcommand — try 'tessera source add <path|git-url>'");
    return 1;
  }
  throw new CliError(`unknown source subcommand '${sub}'`, { hint: "try 'tessera source add'" });
}

export const sourceCommand: Command = {
  name: 'source',
  summary: 'Register + scan a repository (filesystem or git).',
  usage: [
    'Usage: tessera source add <path|git-url> [--label <name>] [--kind filesystem|git]',
    '                          [--no-scan] [--config <path>] [--json]',
    '',
    'A local path is added as git when it contains a .git, else filesystem. A git URL is',
    'shallow-cloned into <data-dir>/sources/ and added as git. The source is scanned into the',
    'corpus unless --no-scan is passed. Uses the same service as POST /v1/sources (ADR-0036).',
  ].join('\n'),
  run: runSource,
};
