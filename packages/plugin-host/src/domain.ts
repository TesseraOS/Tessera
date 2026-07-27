import type { z } from 'zod';

/**
 * The extension-point kinds a plugin can provide (FR-40/58; ARCHITECTURE §12). Each maps to a stable
 * port already defined by its package — Connector/Processor (`@tessera/ingestion`), AIProvider
 * (`@tessera/ai` Embeddings), StorageBackend (`@tessera/storage`), RetrievalStrategy
 * (`@tessera/retrieval`). The Plugin SDK is the uniform envelope around those contracts.
 */
export const PLUGIN_KINDS = [
  'connector',
  'processor',
  'ai-provider',
  'storage-backend',
  'retrieval-strategy',
] as const;

export type PluginKind = (typeof PLUGIN_KINDS)[number];

/**
 * The capabilities a plugin may declare it needs (FR-60, least privilege; ADR-0061 §2).
 *
 * A **closed** vocabulary, deliberately: a free-form permission string cannot be validated at load,
 * which is the one moment the host can still refuse. Anything not on this list is a declaration the
 * host does not understand, and an unrecognized declaration fails the plugin rather than being
 * waved through.
 */
export const PLUGIN_PERMISSIONS = [
  /** Outbound network access (an HTTP connector, a remote embeddings provider). */
  'network',
  /** Read files outside the plugin's own package (a filesystem connector's root). */
  'filesystem:read',
  /** Write files (a processor that materializes derived artifacts). */
  'filesystem:write',
  /** Spawn a child process (a connector shelling out to `git`). */
  'process:spawn',
  /** Read deployment secrets through the host (an API key for a paid provider). */
  'secrets:read',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/** Whether `value` is a permission this host understands. */
export function isPluginPermission(value: unknown): value is PluginPermission {
  return (PLUGIN_PERMISSIONS as readonly unknown[]).includes(value);
}

/** A minimal structural logger so the host/plugins need not depend on a logging implementation. */
export interface PluginLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * The capabilities granted to one plugin — exactly what its manifest declared, and nothing else
 * (FR-60; ADR-0061 §2). The host builds one of these per plugin and hands it to `setup`; a plugin
 * keeps it and asks before doing anything it needed to declare.
 *
 * **This is a gate at the host boundary, not a sandbox.** A plugin runs in-process and can reach for
 * `fs` directly without asking (ADR-0020 already recorded that limit). What this buys is a declared,
 * inspectable surface and a refusal at the seam — not containment.
 */
export interface PluginGrants {
  /** Everything this plugin declared, normalized. */
  readonly granted: readonly PluginPermission[];
  /** Whether `permission` was declared — the non-throwing question. */
  has(permission: PluginPermission): boolean;
  /**
   * Assert `permission` was declared. Throws {@link ForbiddenError} otherwise; thrown during `setup`
   * the host isolates it into `failed`, exactly like any other setup failure.
   */
  require(permission: PluginPermission): void;
}

/** Services the host provides to a plugin during setup. */
export interface PluginContext {
  /** Optional logger bound to the plugin (e.g. `@tessera/observability`'s, passed in by the host). */
  readonly logger?: PluginLogger;
  /** What this plugin is allowed to do. Denied by default: undeclared is refused. */
  readonly permissions: PluginGrants;
}

/**
 * What {@link createPluginHost} itself is constructed with. `permissions` is deliberately absent —
 * grants are *per plugin*, derived from that plugin's own manifest, so only the host can build them.
 * A caller-supplied grant set would be a caller deciding what a plugin may do, which is the opposite
 * of a declaration.
 */
export type PluginHostContext = Omit<PluginContext, 'permissions'>;

/** Describes a plugin: identity + the kind it extends + a Zod schema validating its config. */
export interface PluginManifest<TConfig = unknown> {
  /** Globally unique id, e.g. `tessera.connector.filesystem`. */
  readonly id: string;
  readonly kind: PluginKind;
  readonly name: string;
  readonly version: string;
  /** Validates the plugin's configuration at load time (FR-58). */
  readonly configSchema: z.ZodType<TConfig>;
  /**
   * Capabilities this plugin needs (FR-60). **Optional, and omitting it grants nothing** — the
   * least-privilege default is the safe one here, which is why this is not required. Declarations are
   * validated at load; a plugin is refused anything it did not declare (ADR-0061 §2).
   */
  readonly permissions?: readonly PluginPermission[];
}

/**
 * A plugin's own answer to "can you do your job right now?" (FR-59) — e.g. a connector stat-ing its
 * root, a remote provider pinging its endpoint.
 */
export interface PluginHealth {
  readonly ok: boolean;
  /** Non-sensitive detail: what was checked, or why it is unhealthy. **Never** secrets or credentials. */
  readonly detail?: string;
}

/**
 * A live plugin instance: the capability it provides (the underlying port implementation) plus
 * optional lifecycle hooks the host drives.
 */
export interface PluginInstance<TCapability = unknown> {
  readonly capability: TCapability;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
  /**
   * Optional liveness check (FR-59). The host calls this only while the plugin is `started`, treats a
   * throw as unhealthy, and **never lets it change the plugin's status** — health is a query, not a
   * lifecycle transition. Acting on a bad result is the restart policy's job.
   */
  health?(): Promise<PluginHealth> | PluginHealth;
}

/** One plugin's health as the host reports it. */
export interface PluginHealthReport {
  readonly id: string;
  readonly status: PluginStatus;
  readonly ok: boolean;
  /** Why — including "not started" and "does not report health", which are both `ok` states. */
  readonly detail: string;
}

/** The host's aggregate health (FR-59), suitable for a readiness probe. */
export interface PluginHealthSummary {
  /** True when no registered plugin is unhealthy. **Vacuously true for an empty host** (ADR-0061 §3). */
  readonly ok: boolean;
  readonly plugins: readonly PluginHealthReport[];
}

/**
 * The plugin contract (FR-40). First-party and third-party plugins implement the same interface: a
 * manifest + a `setup` that turns validated config into a {@link PluginInstance}. The capability is
 * the stable port (Connector, Embeddings, Retriever, …) the plugin provides.
 */
export interface Plugin<TConfig = unknown, TCapability = unknown> {
  readonly manifest: PluginManifest<TConfig>;
  setup(
    config: TConfig,
    context: PluginContext,
  ): Promise<PluginInstance<TCapability>> | PluginInstance<TCapability>;
}

/** Lifecycle state of a registered plugin within the host. */
export type PluginStatus = 'registered' | 'loaded' | 'started' | 'stopped' | 'failed';

/** A non-sensitive snapshot of a plugin's state (what `list`/lifecycle calls return). */
export interface PluginInfo {
  readonly id: string;
  readonly kind: PluginKind;
  readonly name: string;
  readonly version: string;
  readonly status: PluginStatus;
  /**
   * The capabilities the manifest declared, normalized (deduped, unrecognized entries excluded).
   * Always present so the host API can show an operator what a plugin claims to need — an empty
   * array is the honest answer for a plugin that declared nothing, not missing information.
   */
  readonly permissions: readonly PluginPermission[];
  /** Present when `status` is `failed` — the isolated error message (never throws out of the host). */
  readonly error?: string;
}
