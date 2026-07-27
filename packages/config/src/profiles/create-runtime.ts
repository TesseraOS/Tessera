import { InternalError } from '@tessera/core';
import type { Env } from '../load.js';
import type { Runtime } from '../runtime.js';
import type { TesseraConfig } from '../schema.js';
import { createLocalRuntime } from './local.js';

export interface CreateRuntimeOptions {
  /** Environment used by the env secrets provider (default `process.env`). */
  readonly env?: Env;
}

/**
 * Wire the runtime for the configured deployment profile (FR-50/FR-53) — **the** entry point every
 * process boots through.
 *
 * Selecting a profile is the whole of the difference between deployments: each one constructs its own
 * adapters and hands them to the shared assembler, so no domain code knows which store it is talking
 * to. This closes the F-023/ADR-0026 deferral that had non-local profiles throwing.
 *
 * **`self-hosted` is loaded by dynamic `import()` on purpose.** Its module graph pulls `pg`, `bullmq`,
 * and `ioredis`; a static import would drag all three into every Local process — including the stdio
 * MCP binary an agent client spawns on a laptop, which will never open a socket to any of them. The
 * same argument as `@tessera/mcp/http` being a subpath (ADR-0058), one level up.
 */
export async function createRuntime(
  config: TesseraConfig,
  options: CreateRuntimeOptions = {},
): Promise<Runtime> {
  switch (config.profile) {
    case 'local':
      return createLocalRuntime(config, options);
    case 'self-hosted':
    case 'cloud': {
      // `cloud` shares the self-hosted composition today; it diverges when managed-only concerns
      // (metering, per-tenant blob keying) land, and having it fall through here rather than throw is
      // what makes that a change of adapters rather than a new profile path.
      const { createSelfHostedRuntime } = await import('./self-hosted.js');
      return createSelfHostedRuntime(config, options);
    }
    default:
      throw new InternalError(`unknown deployment profile "${String(config.profile)}"`);
  }
}
