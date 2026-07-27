import { ConflictError, ForbiddenError, NotFoundError } from '@tessera/core';
import {
  isPluginPermission,
  type Plugin,
  type PluginContext,
  type PluginGrants,
  type PluginHealthReport,
  type PluginHealthSummary,
  type PluginHostContext,
  type PluginInfo,
  type PluginInstance,
  type PluginKind,
  type PluginPermission,
  type PluginStatus,
} from './domain.js';

/** A plugin stored with its config/capability types erased — the host validates + drives it. */
type ErasedPlugin = Plugin<unknown, unknown>;

interface Entry {
  readonly plugin: ErasedPlugin;
  /** Declared permissions the host recognizes, deduped (FR-60). */
  readonly permissions: readonly PluginPermission[];
  /** Declared entries the host does NOT recognize — these fail the plugin at load. */
  readonly unrecognized: readonly string[];
  status: PluginStatus;
  error: string | undefined;
  instance: PluginInstance<unknown> | undefined;
}

/**
 * Split a manifest's declarations into the ones this host understands and the ones it does not
 * (FR-60). Types do not survive a plugin loaded from JavaScript, so the vocabulary is checked at
 * runtime — a declaration the host cannot interpret is not a permission it can enforce.
 */
function partitionPermissions(declared: readonly string[] | undefined): {
  permissions: readonly PluginPermission[];
  unrecognized: readonly string[];
} {
  const permissions: PluginPermission[] = [];
  const unrecognized: string[] = [];
  for (const entry of declared ?? []) {
    if (isPluginPermission(entry)) {
      if (!permissions.includes(entry)) permissions.push(entry);
    } else if (!unrecognized.includes(entry)) {
      unrecognized.push(entry);
    }
  }
  return { permissions, unrecognized };
}

/**
 * The grant set for one plugin (FR-60). Closed over the plugin's own normalized declarations, so
 * there is no path by which a plugin is granted something its manifest did not ask for.
 */
function createGrants(pluginId: string, granted: readonly PluginPermission[]): PluginGrants {
  return {
    granted,
    has: (permission) => granted.includes(permission),
    require(permission) {
      if (!granted.includes(permission)) {
        throw new ForbiddenError(
          `plugin "${pluginId}" did not declare permission "${permission}"`,
          {
            details: { pluginId, permission, declared: [...granted] },
          },
        );
      }
    },
  };
}

/**
 * Health for one plugin (FR-59). Only a `started` plugin is asked; every other status answers from
 * the status itself, because "not running" is not the same as "broken" and a readiness probe that
 * conflates them would hold traffic over a plugin nobody started.
 */
async function healthOf(entry: Entry): Promise<PluginHealthReport> {
  const id = entry.plugin.manifest.id;
  const base = { id, status: entry.status };
  if (entry.status === 'failed') {
    return { ...base, ok: false, detail: entry.error ?? 'failed' };
  }
  if (entry.status !== 'started' || entry.instance === undefined) {
    return { ...base, ok: true, detail: `not started (${entry.status})` };
  }
  if (entry.instance.health === undefined) {
    // The honest answer: the host has nothing to say against a plugin that reports nothing.
    return { ...base, ok: true, detail: 'does not report health' };
  }
  try {
    const health = await entry.instance.health();
    return {
      ...base,
      ok: health.ok,
      detail: health.detail ?? (health.ok ? 'healthy' : 'unhealthy'),
    };
  } catch (error) {
    return { ...base, ok: false, detail: errorMessage(error) };
  }
}

/**
 * The plugin host (FR-40/58): discovery (registration), config validation, lifecycle, and **failure
 * isolation** — a misbehaving plugin is marked `failed` and never throws out of the host or stops
 * other plugins. `load` is the one exception: an *unknown id* is a programming error and throws.
 */
export interface PluginHost {
  /** Register a plugin definition (idempotent ids; a duplicate id is a {@link ConflictError}). */
  register<TConfig, TCapability>(plugin: Plugin<TConfig, TCapability>): void;
  has(id: string): boolean;
  /** Validate config against the plugin's schema, then `setup`. Failures are isolated → `failed`. */
  load(id: string, config?: unknown): Promise<PluginInfo>;
  /** Start a loaded (or stopped) plugin's instance. */
  start(id: string): Promise<PluginInfo>;
  /** Start every loaded plugin, isolating failures. */
  startAll(): Promise<readonly PluginInfo[]>;
  /** Stop a started plugin's instance. */
  stop(id: string): Promise<PluginInfo>;
  /** Stop every started plugin (reverse order), isolating failures. */
  stopAll(): Promise<readonly PluginInfo[]>;
  /** Dispose every instance (reverse order) and clear them, isolating failures. */
  dispose(): Promise<readonly PluginInfo[]>;
  /**
   * Aggregate health across every registered plugin (FR-59). Isolated like everything else: a plugin
   * whose `health()` throws is reported unhealthy, never propagated.
   */
  health(): Promise<PluginHealthSummary>;
  /** The capability a loaded plugin provides (the underlying port), or `undefined`. */
  capability<T = unknown>(id: string): T | undefined;
  /** Snapshots of every registered plugin, optionally filtered by kind. */
  list(filter?: { readonly kind?: PluginKind }): readonly PluginInfo[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toInfo(entry: Entry): PluginInfo {
  const { manifest } = entry.plugin;
  const base = {
    id: manifest.id,
    kind: manifest.kind,
    name: manifest.name,
    version: manifest.version,
    status: entry.status,
    permissions: entry.permissions,
  };
  return entry.error === undefined ? base : { ...base, error: entry.error };
}

/**
 * Create a {@link PluginHost}. `context` is the base handed to each plugin's `setup` (e.g. a bound
 * logger); the host adds that plugin's own {@link PluginGrants} to it at load.
 */
export function createPluginHost(context: PluginHostContext = {}): PluginHost {
  const entries = new Map<string, Entry>();
  const order: string[] = [];

  function require(id: string): Entry {
    const entry = entries.get(id);
    if (entry === undefined) {
      throw new NotFoundError('plugin not registered', { details: { id } });
    }
    return entry;
  }

  async function startEntry(entry: Entry): Promise<void> {
    if (entry.instance === undefined || (entry.status !== 'loaded' && entry.status !== 'stopped')) {
      return;
    }
    try {
      await entry.instance.start?.();
      entry.status = 'started';
      entry.error = undefined;
    } catch (error) {
      entry.status = 'failed';
      entry.error = errorMessage(error);
    }
  }

  async function stopEntry(entry: Entry): Promise<void> {
    if (entry.instance === undefined || entry.status !== 'started') return;
    try {
      await entry.instance.stop?.();
      entry.status = 'stopped';
      entry.error = undefined;
    } catch (error) {
      entry.status = 'failed';
      entry.error = errorMessage(error);
    }
  }

  return {
    register(plugin) {
      const { id } = plugin.manifest;
      if (entries.has(id)) {
        throw new ConflictError('plugin id already registered', { details: { id } });
      }
      const { permissions, unrecognized } = partitionPermissions(plugin.manifest.permissions);
      entries.set(id, {
        plugin: plugin as unknown as ErasedPlugin,
        permissions,
        unrecognized,
        status: 'registered',
        error: undefined,
        instance: undefined,
      });
      order.push(id);
    },

    has(id) {
      return entries.has(id);
    },

    async load(id, config) {
      const entry = require(id);
      // Before config, before setup: a manifest declaring a capability this host cannot interpret is
      // refused (FR-60). Loading it anyway would mean running a plugin whose stated needs the host
      // has already admitted it does not understand.
      if (entry.unrecognized.length > 0) {
        entry.status = 'failed';
        entry.error = `unrecognized permission(s): ${entry.unrecognized.join(', ')}`;
        entry.instance = undefined;
        return toInfo(entry);
      }
      const parsed = entry.plugin.manifest.configSchema.safeParse(config ?? {});
      if (!parsed.success) {
        entry.status = 'failed';
        entry.error = `invalid config: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`;
        entry.instance = undefined;
        return toInfo(entry);
      }
      const pluginContext: PluginContext = {
        ...context,
        permissions: createGrants(id, entry.permissions),
      };
      try {
        entry.instance = await entry.plugin.setup(parsed.data, pluginContext);
        entry.status = 'loaded';
        entry.error = undefined;
      } catch (error) {
        entry.status = 'failed';
        entry.error = errorMessage(error);
        entry.instance = undefined;
      }
      return toInfo(entry);
    },

    async start(id) {
      const entry = require(id);
      await startEntry(entry);
      return toInfo(entry);
    },

    async startAll() {
      for (const id of order) await startEntry(require(id));
      return order.map((id) => toInfo(require(id)));
    },

    async stop(id) {
      const entry = require(id);
      await stopEntry(entry);
      return toInfo(entry);
    },

    async stopAll() {
      for (const id of [...order].reverse()) await stopEntry(require(id));
      return order.map((id) => toInfo(require(id)));
    },

    async dispose() {
      for (const id of [...order].reverse()) {
        const entry = require(id);
        if (entry.instance !== undefined) {
          try {
            await entry.instance.dispose?.();
          } catch (error) {
            entry.status = 'failed';
            entry.error = errorMessage(error);
          }
          entry.instance = undefined;
        }
      }
      return order.map((id) => toInfo(require(id)));
    },

    async health() {
      const plugins = await Promise.all(order.map((id) => healthOf(require(id))));
      // Vacuously true for an empty host — see ADR-0061 §3. The caller (the readiness probe) is the
      // one that says "0 plugins registered"; the summary just reports what it found.
      return { ok: plugins.every((plugin) => plugin.ok), plugins };
    },

    capability<T = unknown>(id: string): T | undefined {
      return entries.get(id)?.instance?.capability as T | undefined;
    },

    list(filter) {
      return order
        .map((id) => require(id))
        .filter((entry) => filter?.kind === undefined || entry.plugin.manifest.kind === filter.kind)
        .map(toInfo);
    },
  };
}
