import { NotFoundError, type EventBus, type TenantId } from '@tessera/core';
import type { Queue } from '@tessera/storage';
import type { IngestionEvents, ScanSummary, SourceDescriptor, SourceId } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import type { IngestionManifest } from '../ports/manifest.js';
import { createIngestionCoordinator } from '../pipeline/coordinator.js';
import type { RegisterSourceInput, SourceRecord, SourceRegistry } from './registry.js';

/** Lifecycle state of a source's most recent scan. */
export type ScanState = 'idle' | 'running' | 'error';

/** The (in-memory) scan status the runtime reports per source (FR-62). */
export interface SourceScanStatus {
  readonly state: ScanState;
  /** The most recent completed scan's summary + time (absent until the first completes). */
  readonly lastScan?: { readonly summary: ScanSummary; readonly at: string };
  /** The last scan error message when `state: 'error'`. */
  readonly error?: string;
}

/** The result of triggering a scan: the source plus what changed. */
export interface SourceScanResult {
  readonly source: SourceRecord;
  readonly summary: ScanSummary;
}

/**
 * Builds a {@link Connector} for a registered source. The composition root supplies this (it knows the
 * available connector kinds — filesystem/git); it **throws** a validation error for an unsupported kind,
 * which {@link SourceService.register} surfaces as a clean 4xx.
 */
export type ConnectorFactory = (record: SourceRecord) => Connector;

export interface SourceServiceOptions {
  readonly registry: SourceRegistry;
  readonly queue: Queue;
  readonly manifest: IngestionManifest;
  readonly connectorFactory: ConnectorFactory;
  /** Ingestion event bus for scan-lifecycle events (the composition root bridges it to SSE). */
  readonly events?: EventBus<IngestionEvents>;
}

/**
 * The runtime source-management service (F-038; FR-62/FR-6/FR-7) the REST + MCP surfaces wrap. It owns
 * the {@link SourceRegistry} (register/list/get/remove) and drives scans through the F-006
 * coordinator/worker pipeline: {@link SourceService.scan} lists the source, diffs it against the manifest,
 * enqueues the changes, and — where the queue supports it ({@link Queue.drain}) — awaits processing so a
 * Local scan is synchronous-complete. It caches a connector per source (feeding the worker's per-source
 * resolver) and tracks in-memory scan status. Tenant-scoped via {@link SourceService.forTenant}.
 */
export interface SourceService {
  list(): Promise<readonly SourceRecord[]>;
  register(input: RegisterSourceInput): Promise<SourceRecord>;
  get(id: SourceId): Promise<SourceRecord | undefined>;
  remove(id: SourceId): Promise<void>;
  scan(id: SourceId): Promise<SourceScanResult>;
  scanStatus(id: SourceId): Promise<SourceScanStatus | undefined>;
  /**
   * Resolve the connector for a source seen on the queue — the seam the runtime wires into
   * {@link import('../pipeline/worker.js').IngestionWorkerOptions.connectorFor}. Returns `undefined`
   * for a source that was never registered/scanned in this process.
   */
  connectorFor(source: SourceDescriptor): Connector | undefined;
  forTenant(tenantId: TenantId): SourceService;
}

export function createSourceService(options: SourceServiceOptions): SourceService {
  const { queue, manifest, connectorFactory, events } = options;
  // Shared across tenant views: a source's connector is resolvable by the worker regardless of which
  // tenant view triggered the scan (source ids are globally unique), and status is process-wide.
  const connectors = new Map<SourceId, Connector>();
  const statuses = new Map<SourceId, SourceScanStatus>();

  function ensureConnector(record: SourceRecord): Connector {
    let connector = connectors.get(record.id);
    if (connector === undefined) {
      connector = connectorFactory(record); // throws for an unsupported kind
      connectors.set(record.id, connector);
    }
    return connector;
  }

  function viewFor(registry: SourceRegistry): SourceService {
    return {
      list() {
        return registry.list();
      },

      async register(input) {
        const record = await registry.register(input);
        try {
          ensureConnector(record); // fail fast on an unsupported kind
        } catch (error) {
          await registry.remove(record.id);
          throw error;
        }
        return record;
      },

      get(id) {
        return registry.get(id);
      },

      async remove(id) {
        await registry.remove(id);
        connectors.delete(id);
        statuses.delete(id);
      },

      async scan(id) {
        const record = await registry.get(id);
        if (record === undefined) {
          throw new NotFoundError('source not found', { details: { id } });
        }
        const connector = ensureConnector(record);
        const source: SourceDescriptor = {
          id: record.id,
          kind: record.kind,
          label: record.label,
        };

        const previous = statuses.get(id);
        statuses.set(id, {
          state: 'running',
          ...(previous?.lastScan !== undefined ? { lastScan: previous.lastScan } : {}),
        });
        await events?.emit('source.scan.started', {
          sourceId: id,
          kind: record.kind,
          label: record.label,
        });

        try {
          const coordinator = createIngestionCoordinator({ queue, connector, source, manifest });
          const summary = await coordinator.scan();
          // Turn the fire-and-forget queue into a completion barrier where supported (Local profile),
          // so the summary reflects fully-processed work; async adapters observe progress via SSE.
          await queue.drain?.();

          const at = new Date().toISOString();
          statuses.set(id, { state: 'idle', lastScan: { summary, at } });
          await events?.emit('source.scan.completed', {
            sourceId: id,
            kind: record.kind,
            label: record.label,
            summary,
          });
          return { source: record, summary };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          statuses.set(id, {
            state: 'error',
            error: message,
            ...(previous?.lastScan !== undefined ? { lastScan: previous.lastScan } : {}),
          });
          throw error;
        }
      },

      async scanStatus(id) {
        // Only report status for a source visible in this tenant view.
        const record = await registry.get(id);
        if (record === undefined) return undefined;
        return statuses.get(id) ?? { state: 'idle' };
      },

      connectorFor(source) {
        return connectors.get(source.id);
      },

      forTenant(tenantId) {
        return viewFor(registry.forTenant(tenantId));
      },
    };
  }

  return viewFor(options.registry);
}
