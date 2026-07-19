import { PERMISSIONS, ROLES, type Permission, type Role } from '@tessera/api/auth';
import { createServerRuntime } from '@tessera/server';
import { flagBool, flagList, flagStr, parseArgs } from '../args.js';
import type { Command } from '../command.js';
import { loadConfigFile } from '../config-file.js';
import { CliError } from '../errors.js';
import { errline, line, type Io } from '../io.js';
import { printJson } from '../output.js';

async function issueToken(io: Io, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, { booleans: ['json'] });
  const json = flagBool(args, 'json');

  const roles = flagList(args, 'roles') ?? [];
  const invalidRoles = roles.filter((role) => !(ROLES as readonly string[]).includes(role));
  if (roles.length === 0 || invalidRoles.length > 0) {
    throw new CliError(
      `--roles must be a comma list of ${ROLES.join('|')}` +
        (invalidRoles.length > 0 ? ` (unknown: ${invalidRoles.join(',')})` : ''),
    );
  }

  const scopes = flagList(args, 'scopes');
  const invalidScopes = (scopes ?? []).filter(
    (scope) => !(PERMISSIONS as readonly string[]).includes(scope),
  );
  if (invalidScopes.length > 0) {
    throw new CliError(`--scopes has unknown permissions: ${invalidScopes.join(',')}`);
  }

  const tenant = flagStr(args, 'tenant') ?? 'default';
  const principal = flagStr(args, 'principal') ?? 'admin';
  const name = flagStr(args, 'name');

  const { input } = loadConfigFile(io, flagStr(args, 'config'));
  const runtime = await createServerRuntime({ env: io.env, config: input });
  try {
    const tokenStore = runtime.auth.tokenStore;
    if (tokenStore === undefined) {
      throw new CliError('token issuance requires auth.mode=token', {
        hint: "run 'tessera init --auth token' or set TESSERA_AUTH_MODE=token",
      });
    }
    const { token, record } = await tokenStore.issue({
      tenantId: tenant,
      principalId: principal,
      roles: roles as Role[],
      ...(scopes !== undefined ? { scopes: scopes as Permission[] } : {}),
      ...(name !== undefined ? { displayName: name } : {}),
    });

    if (json) {
      printJson(io, {
        id: record.id,
        tenantId: record.tenantId,
        principalId: record.principalId,
        roles: record.roles,
        token,
      });
    } else {
      line(
        io,
        `Issued token ${record.id} — tenant "${record.tenantId}", principal "${record.principalId}", roles [${record.roles.join(', ')}]`,
      );
      line(io, token);
      errline(io, 'Store this secret now — it is not recoverable.');
    }
    return 0;
  } finally {
    await runtime.close();
  }
}

async function runToken(io: Io, argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  if (sub === 'issue') return issueToken(io, argv.slice(1));
  if (sub === undefined) {
    errline(io, "error: missing subcommand — try 'tessera token issue'");
    return 1;
  }
  throw new CliError(`unknown token subcommand '${sub}'`, { hint: "try 'tessera token issue'" });
}

export const tokenCommand: Command = {
  name: 'token',
  summary: 'Issue a scoped API token (auth.mode=token).',
  usage: [
    'Usage: tessera token issue --roles <owner|admin|member|viewer>[,...] [options]',
    '',
    'Options:',
    '  --tenant <id>       tenant the token belongs to (default: default)',
    '  --principal <id>    principal id (default: admin)',
    '  --roles <list>      comma-separated roles (required)',
    '  --scopes <list>     optional permission scopes (least-privilege upper bound)',
    '  --name <label>      human label for the token',
    '  --config <path>     config file (default: ./tessera.config.json)',
    '  --json              print the token + record as JSON',
    '',
    'Requires auth.mode=token. Prints the secret once — it is not recoverable.',
  ].join('\n'),
  run: runToken,
};
