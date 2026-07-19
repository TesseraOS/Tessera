import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ConfigInput } from '@tessera/config';
import { CliError } from './errors.js';
import type { Io } from './io.js';

/** The config file `tessera init` writes and the other commands read (relative to the cwd). */
export const DEFAULT_CONFIG_FILE = 'tessera.config.json';

export interface ResolvedConfig {
  /** The parsed config overrides passed to `createServerRuntime` (empty when no file is present). */
  readonly input: ConfigInput;
  /** The absolute path the config came from, or `undefined` when none was found (defaults/env only). */
  readonly path: string | undefined;
}

/** Absolute path to the config file: `--config <path>` (resolved) or `<cwd>/tessera.config.json`. */
export function configPath(io: Io, explicit?: string): string {
  if (explicit !== undefined) return isAbsolute(explicit) ? explicit : resolve(io.cwd, explicit);
  return resolve(io.cwd, DEFAULT_CONFIG_FILE);
}

function readAndParse(path: string): ConfigInput {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new CliError(`cannot read config file: ${path}`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`config file is not valid JSON: ${path}`, {
      cause: error,
      hint: "fix the JSON or re-run 'tessera init --force'",
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(`config file must be a JSON object: ${path}`);
  }
  return parsed as ConfigInput;
}

/**
 * Load the config file the CLI operates against. An explicit `--config` that is missing is an error; a
 * missing **default** file is fine (commands fall back to `TESSERA_*` env + built-in defaults). The
 * returned `input` is passed to `createServerRuntime` as overrides — see the precedence note in help.
 */
export function loadConfigFile(io: Io, explicit?: string): ResolvedConfig {
  if (explicit !== undefined) {
    const path = configPath(io, explicit);
    if (!existsSync(path)) {
      throw new CliError(`config file not found: ${path}`, { hint: "run 'tessera init' first" });
    }
    return { input: readAndParse(path), path };
  }
  const path = configPath(io);
  if (!existsSync(path)) return { input: {}, path: undefined };
  return { input: readAndParse(path), path };
}
