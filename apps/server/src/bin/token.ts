#!/usr/bin/env node
import { PERMISSIONS, ROLES, type Permission, type Role } from '@tessera/api/auth';
import { createServerRuntime } from '../bootstrap.js';

/**
 * `tessera-token` — issue a scoped API token for `token` auth mode (F-034). Requires
 * `TESSERA_AUTH_MODE=token` so the runtime has a persistent token store. Prints the secret **once**.
 *
 * Usage: tessera-token --tenant <id> --principal <id> --roles owner,member [--scopes search:read,...] [--name "CI bot"]
 */

interface TokenArgs {
  tenant: string;
  principal: string;
  roles: Role[];
  scopes?: Permission[];
  name?: string;
}

function parseList(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseArgs(argv: readonly string[]): TokenArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key !== undefined && key.startsWith('--') && val !== undefined) {
      flags.set(key.slice(2), val);
    }
  }

  const roles = parseList(flags.get('roles'));
  const invalidRoles = roles.filter((role) => !(ROLES as readonly string[]).includes(role));
  if (roles.length === 0 || invalidRoles.length > 0) {
    throw new Error(
      `--roles must be a comma list of ${ROLES.join('|')}` +
        (invalidRoles.length > 0 ? ` (unknown: ${invalidRoles.join(',')})` : ''),
    );
  }

  const scopes = parseList(flags.get('scopes'));
  const invalidScopes = scopes.filter(
    (scope) => !(PERMISSIONS as readonly string[]).includes(scope),
  );
  if (invalidScopes.length > 0) {
    throw new Error(`--scopes has unknown permissions: ${invalidScopes.join(',')}`);
  }

  const name = flags.get('name');
  return {
    tenant: flags.get('tenant') ?? 'default',
    principal: flags.get('principal') ?? 'admin',
    roles: roles as Role[],
    ...(scopes.length > 0 ? { scopes: scopes as Permission[] } : {}),
    ...(name !== undefined ? { name } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runtime = await createServerRuntime();
  try {
    const tokenStore = runtime.auth.tokenStore;
    if (tokenStore === undefined) {
      throw new Error('token issuance requires auth.mode=token (set TESSERA_AUTH_MODE=token)');
    }
    const { token, record } = await tokenStore.issue({
      tenantId: args.tenant,
      principalId: args.principal,
      roles: args.roles,
      ...(args.scopes !== undefined ? { scopes: args.scopes } : {}),
      ...(args.name !== undefined ? { displayName: args.name } : {}),
    });
    process.stdout.write(
      `Issued token ${record.id} — tenant "${record.tenantId}", principal "${record.principalId}", roles [${record.roles.join(', ')}]\n`,
    );
    process.stdout.write(`${token}\n`);
    process.stdout.write('Store this secret now — it is not recoverable.\n');
  } finally {
    await runtime.close();
  }
}

main().catch((error: unknown) => {
  console.error('failed to issue token:', error instanceof Error ? error.message : error);
  process.exit(1);
});
