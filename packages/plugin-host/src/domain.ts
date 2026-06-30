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

/** A minimal structural logger so the host/plugins need not depend on a logging implementation. */
export interface PluginLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** Services the host provides to a plugin during setup. Kept minimal for R0. */
export interface PluginContext {
  /** Optional logger bound to the plugin (e.g. `@tessera/observability`'s, passed in by the host). */
  readonly logger?: PluginLogger;
}

/** Describes a plugin: identity + the kind it extends + a Zod schema validating its config. */
export interface PluginManifest<TConfig = unknown> {
  /** Globally unique id, e.g. `tessera.connector.filesystem`. */
  readonly id: string;
  readonly kind: PluginKind;
  readonly name: string;
  readonly version: string;
  /** Validates the plugin's configuration at load time (FR-58). */
  readonly configSchema: z.ZodType<TConfig>;
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
  /** Present when `status` is `failed` — the isolated error message (never throws out of the host). */
  readonly error?: string;
}
