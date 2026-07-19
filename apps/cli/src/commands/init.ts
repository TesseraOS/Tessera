import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  DEFAULT_DATA_DIR,
  EMBEDDING_PROVIDERS,
  loadConfig,
  type ConfigInput,
  type EmbeddingProvider,
} from '@tessera/config';
import { createServerRuntime } from '@tessera/server';
import { flagBool, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { DEFAULT_CONFIG_FILE } from '../config-file.js';
import { CliError } from '../errors.js';
import { line, type Io } from '../io.js';
import { printJson } from '../output.js';

/** Auth modes `init` can scaffold a bootable config for. `oidc` needs an external IdP (issuer/audience). */
const INIT_AUTH_MODES = ['none', 'token'] as const;

/** Build the config `init` writes: Local profile, data under `dataDir`, chosen embeddings + auth mode. */
function buildConfig(dataDir: string, embeddings: EmbeddingProvider, auth: string): ConfigInput {
  // POSIX-style paths so the file is portable; Node resolves them against the cwd on every platform.
  const prefix = dataDir.replace(/\\/g, '/').replace(/\/+$/, '');
  return {
    profile: 'local',
    storage: {
      sqlitePath: `${prefix}/tessera.db`,
      vectorPath: `${prefix}/vectors.db`,
      blobRoot: `${prefix}/blobs`,
    },
    embeddings: { provider: embeddings },
    auth: { mode: auth as 'none' | 'token' },
  };
}

async function runInit(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['force', 'verify', 'json'] });
  const json = flagBool(args, 'json');

  const dirFlag = flagStr(args, 'dir');
  const projectDir = dirFlag !== undefined ? resolve(io.cwd, dirFlag) : io.cwd;
  const dataDir = flagStr(args, 'data-dir') ?? DEFAULT_DATA_DIR;
  // Where the data actually lives on disk: an absolute --data-dir is honored as-is; a relative one
  // (the default `.tessera`) sits under the project dir and is stored relative for a portable config.
  const dataRoot = isAbsolute(dataDir) ? dataDir : join(projectDir, dataDir);

  const auth = flagStr(args, 'auth') ?? 'none';
  if (!(INIT_AUTH_MODES as readonly string[]).includes(auth)) {
    throw new CliError(`--auth must be one of ${INIT_AUTH_MODES.join('|')}`, {
      hint: "oidc needs an external IdP — scaffold with 'none' or 'token' and edit the config after.",
    });
  }

  const embeddings = (flagStr(args, 'embeddings') ?? 'transformers') as EmbeddingProvider;
  if (!(EMBEDDING_PROVIDERS as readonly string[]).includes(embeddings)) {
    throw new CliError(`--embeddings must be one of ${EMBEDDING_PROVIDERS.join('|')}`);
  }

  const input = buildConfig(dataDir, embeddings, auth);

  // Validate before writing anything — fail fast on a bad flag combination rather than write junk.
  try {
    loadConfig(io.env, input);
  } catch (error) {
    throw new CliError(`the requested configuration is invalid: ${(error as Error).message}`);
  }

  const configFlag = flagStr(args, 'config');
  const configFile =
    configFlag !== undefined
      ? isAbsolute(configFlag)
        ? configFlag
        : resolve(io.cwd, configFlag)
      : join(projectDir, DEFAULT_CONFIG_FILE);

  if (existsSync(configFile) && !flagBool(args, 'force')) {
    throw new CliError(`config already exists: ${configFile}`, {
      hint: 'pass --force to overwrite',
    });
  }

  // Scaffold: the data dir (+ blobs) and the config file.
  mkdirSync(join(dataRoot, 'blobs'), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(input, null, 2)}\n`);

  // Optional real boot (offline-hostile with the transformers model download, so opt-in). Boots with
  // absolute storage paths so it works regardless of the current cwd, then releases handles.
  if (flagBool(args, 'verify')) {
    const bootConfig: ConfigInput = {
      ...input,
      storage: {
        sqlitePath: join(dataRoot, 'tessera.db'),
        vectorPath: join(dataRoot, 'vectors.db'),
        blobRoot: join(dataRoot, 'blobs'),
      },
    };
    const runtime = await createServerRuntime({ env: io.env, config: bootConfig });
    await runtime.close();
  }

  if (json) {
    printJson(io, { configFile, dataDir: dataRoot, auth, embeddings });
    return 0;
  }

  line(io, `Initialized Tessera in ${projectDir}`);
  line(io, `  config: ${configFile}`);
  line(io, `  data:   ${dataRoot}  (profile local, auth ${auth}, embeddings ${embeddings})`);
  line(io, '');
  line(io, 'Next steps:');
  line(io, '  tessera source add <path|git-url>   ingest a repository');
  line(io, '  tessera serve                       run the REST API');
  line(io, '  tessera mcp-config                  wire your agent to the MCP server');
  return 0;
}

export const initCommand: Command = {
  name: 'init',
  summary: 'Scaffold config + data dir for a Local deployment.',
  usage: [
    'Usage: tessera init [--dir <path>] [--data-dir <path>] [--auth none|token]',
    '                   [--embeddings transformers|ollama|fake] [--verify] [--force] [--json]',
    '',
    'Writes tessera.config.json and creates the data directory (default .tessera).',
    'Config precedence: built-in defaults < tessera.config.json < TESSERA_* env < flags.',
    '--verify boots the profile once to prove it wires (may download the embedding model).',
    'It does NOT start a long-running server — use `tessera serve` (REST) and `tessera mcp`.',
  ].join('\n'),
  run: runInit,
};
