/**
 * A small, dependency-free argument parser for the `tessera` CLI. Deliberately not `minimist`/`yargs`:
 * the surface is a handful of long flags, and hand-rolling keeps the dependency graph clean (matching
 * the repo's dependency-light ethos — cf. the git connector avoiding a git dependency).
 *
 * Grammar:
 * - `--key=value` → always a valued flag.
 * - `--key value` → valued **unless** `key` is a declared boolean (then `--key` is `true` and `value`
 *   is a positional). Declaring booleans is what disambiguates `--json ./repo` (json is boolean, so
 *   `./repo` is a positional) from `--port 3000` (port is not boolean, so it consumes `3000`).
 * - `--key` at the end or before another flag → `true`.
 * - `-x` (single dash) → boolean flag keyed by the letters after the dash (so `-h`/`-v` are captured,
 *   never mistaken for a path positional).
 * - `--` → everything after it is a positional (the standard end-of-flags separator).
 */
export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | boolean>;
}

export interface ArgSpec {
  /** Flag names (without `--`) that never consume the following token. */
  readonly booleans?: readonly string[];
}

export function parseArgs(argv: readonly string[], spec: ArgSpec = {}): ParsedArgs {
  const booleans = new Set(spec.booleans ?? []);
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) break;

    if (token === '--') {
      positionals.push(...argv.slice(i + 1).filter((t): t is string => t !== undefined));
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (!booleans.has(body) && next !== undefined && !next.startsWith('-')) {
        flags.set(body, next);
        i += 2;
        continue;
      }
      flags.set(body, true);
      i += 1;
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      flags.set(token.slice(1), true);
      i += 1;
      continue;
    }

    positionals.push(token);
    i += 1;
  }

  return { positionals, flags };
}

/** First present flag among `names` whose value is a string (a present-but-valueless flag → `undefined`). */
export function flagStr(args: ParsedArgs, ...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = args.flags.get(name);
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** True when any of `names` is present (as a boolean flag or with a value). */
export function flagBool(args: ParsedArgs, ...names: readonly string[]): boolean {
  return names.some((name) => args.flags.has(name));
}

/** Comma-separated list value for the first present `names` (trimmed, non-empty); `undefined` if absent. */
export function flagList(args: ParsedArgs, ...names: readonly string[]): string[] | undefined {
  const raw = flagStr(args, ...names);
  if (raw === undefined) return undefined;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}
