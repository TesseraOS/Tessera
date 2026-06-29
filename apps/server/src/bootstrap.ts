import {
  createLocalRuntime,
  loadConfig,
  type ConfigInput,
  type Env,
  type Runtime,
} from '@tessera/config';

export interface ServerRuntimeOptions {
  /** Environment used for config overrides + the env secrets provider (default `process.env`). */
  readonly env?: Env;
  /** Explicit config overrides (win over `TESSERA_*` env vars). */
  readonly config?: ConfigInput;
}

/**
 * Boot a {@link Runtime} from configuration: load + validate config (env + overrides), then wire the
 * Local profile. The shared entry both the REST and MCP processes build on (ADR-0018). This module
 * lives outside `@tessera/api`/`@tessera/config` so the dependency graph stays acyclic.
 */
export function createServerRuntime(options: ServerRuntimeOptions = {}): Promise<Runtime> {
  const env = options.env ?? process.env;
  const config = loadConfig(env, options.config ?? {});
  return createLocalRuntime(config, { env });
}
