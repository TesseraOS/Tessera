import {
  ConflictError,
  NotFoundError,
  type EventBus,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { Queue } from '@tessera/storage';
import type { IngestionEvents, ScanSummary, SourceDescriptor, SourceId } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import type { IngestionManifest } from '../ports/manifest.js';
import { createIngestionCoordinator } from '../pipeline/coordinator.js';
import type { RegisterSourceInput, SourceRecord, SourceRegistry } from './registry.js';

/** Lifecycle state of a source's most recent scan. */
export type ScanState = 'idle' | 'running' | 'error';

/** How far a running scan has got (F-081). `processed` counts distinct paths, so it never regresses. */
export interface ScanProgress {
  readonly processed: number;
  /** Changed paths this scan will process. `0` is a real answer — nothing changed. */
  readonly total: number;
}

/** The (in-memory) scan status the runtime reports per source (FR-62). */
export interface SourceScanStatus {
  readonly state: ScanState;
  /**
   * Progress of the scan in flight — present while `state: 'running'` (F-081).
   *
   * Before F-081 there was no progress *data* at all, which is why the dashboard could only show an
   * unbounded spinner: the fix is not a UI change, it is that nothing counted.
   */
  readonly progress?: ScanProgress;
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

/** Aggregate numbers across one tenant's sources — backs the workspace summary (F-060). */
export interface SourceSummary {
  /** Sources registered to this tenant. */
  readonly sources: number;
  /** Distinct documents indexed across those sources (the manifest's `path → hash` entries). */
  readonly documents: number;
  /**
   * When any of this tenant's sources last completed a scan, or `null` if none has **in this
   * process**. Scan status is in-memory (see {@link SourceScanStatus}), so a restart resets this to
   * `null` even though scans happened — nothing persists a scan timestamp today. Callers must
   * present it as "no scan this session", never as "never scanned".
   */
  readonly lastScanAt: string | null;
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
  /** Scan a source immediately when it is registered (FR-62; default `false` — the agent scans). */
  readonly autoScanOnRegister?: boolean;
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
  /**
   * Scan and **await completion**, resolving with what changed.
   *
   * Kept exactly as it was, deliberately (F-081). The MCP `scan_source` tool returns this summary,
   * and an agent asking "scan and tell me what changed" wants the answer — degrading that to
   * "started, poll elsewhere" would be a regression dressed up as an improvement. REST uses
   * {@link SourceService.startScan} instead, because an HTTP client should not hold a request open
   * for an entire ingest.
   */
  scan(id: SourceId): Promise<SourceScanResult>;
  /**
   * Start a scan in the background and return as soon as it is **accepted** (F-081).
   *
   * Resolves with the status the caller should report (`running`). The scan itself continues after
   * this resolves; observe it via {@link SourceService.scanStatus} or the `source.scan.*` events.
   * Throws {@link ConflictError} if a scan of this source is already running — two coordinators
   * racing over one manifest is not a scan, it is a data race.
   */
  startScan(id: SourceId): Promise<SourceScanStatus>;
  scanStatus(id: SourceId): Promise<SourceScanStatus | undefined>;
  /**
   * Aggregate numbers for this tenant's sources (F-060). Counts documents from the manifest rather
   * than the corpus, so it is tenant-correct by construction: the *registry* is tenant-scoped, and
   * only this tenant's sources are summed.
   */
  summary(): Promise<SourceSummary>;
  /**
   * Resolve the connector for a source seen on the queue — the seam the runtime wires into
   * {@link import('../pipeline/worker.js').IngestionWorkerOptions.connectorFor}. Returns `undefined`
   * for a source that was never registered/scanned in this process.
   */
  connectorFor(source: SourceDescriptor): Connector | undefined;
  /** A view scoped to `tenantId` (reset to its default project) — the catalog is tenant-isolated (ADR-0033). */
  forTenant(tenantId: TenantId): SourceService;
  /** A view scoped to `projectId` within the current tenant — the catalog is project-isolated (ADR-0037). */
  forProject(projectId: ProjectId): SourceService;
}

export function createSourceService(options: SourceServiceOptions): SourceService {
  const { queue, manifest, connectorFactory, events } = options;
  const autoScanOnRegister = options.autoScanOnRegister ?? false;
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

  /** Run one scan for a source in the given tenant view: diff → enqueue → (drain) → status + events. */
  async function performScan(registry: SourceRegistry, id: SourceId): Promise<SourceScanResult> {
    const record = await registry.get(id);
    if (record === undefined) {
      throw new NotFoundError('source not found', { details: { id } });
    }
    const connector = ensureConnector(record);
    const source: SourceDescriptor = { id: record.id, kind: record.kind, label: record.label };
    // The owning tenant, so the SSE bridge delivers these only to them (ADR-0050): the label is a
    // repository name, which is one org's business and not another's.
    const scope = {
      sourceId: id,
      tenantId: record.tenantId,
      kind: record.kind,
      label: record.label,
    };

    const previous = statuses.get(id);
    const keepLast = previous?.lastScan !== undefined ? { lastScan: previous.lastScan } : {};

    /*
     * Count DISTINCT paths, not events (F-081). The queue may retry a handler, so
     * `document.processed` can fire twice for one job; a Set makes the counter idempotent and
     * monotonic instead of letting progress overshoot `total`.
     */
    const processedPaths = new Set<string>();
    let total = 0;
    let unsubscribe: (() => void) | undefined;

    statuses.set(id, { state: 'running', progress: { processed: 0, total: 0 }, ...keepLast });

    try {
      const coordinator = createIngestionCoordinator({ queue, connector, source, manifest });

      // Subscribe BEFORE the diff enqueues anything: the in-process queue delivers on the microtask
      // queue, so a job can complete while we are still awaiting `scan()`. Subscribing after would
      // silently miss those and under-report progress — the F-079 shape of bug, one layer down.
      unsubscribe = events?.on('document.processed', (event) => {
        if (event.sourceId !== id) return;
        processedPaths.add(event.path);
        const progress = { processed: processedPaths.size, total };
        statuses.set(id, { state: 'running', progress, ...keepLast });
        void events?.emit('source.scan.progress', { ...scope, ...progress });
      });

      const summary = await coordinator.scan();
      // What the diff actually enqueued — `unchanged` is not work, so it is not in the denominator.
      total = summary.added + summary.modified + summary.removed;
      await events?.emit('source.scan.started', { ...scope, total });
      statuses.set(id, {
        state: 'running',
        progress: { processed: processedPaths.size, total },
        ...keepLast,
      });

      // Turn the fire-and-forget queue into a completion barrier where supported (Local profile),
      // so the summary reflects fully-processed work; async adapters observe progress via SSE.
      await queue.drain?.();

      const at = new Date().toISOString();
      statuses.set(id, { state: 'idle', lastScan: { summary, at } });
      await events?.emit('source.scan.completed', { ...scope, summary });
      return { source: record, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      statuses.set(id, { state: 'error', error: message, ...keepLast });
      // A background scan's caller is long gone by the time this throws (see `startScan`), so the
      // failure has to reach the stream or it reaches nobody.
      await events?.emit('source.scan.failed', { ...scope, error: message });
      throw error;
    } finally {
      unsubscribe?.();
    }
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
        // Optionally scan immediately on registration (config-driven, FR-62); default is manual.
        if (autoScanOnRegister) {
          await performScan(registry, record.id);
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

      scan(id) {
        return performScan(registry, id);
      },

      async startScan(id) {
        // Resolve the source in THIS tenant's view first: a background job must not be startable
        // against a source the caller cannot see, and a 404 has to surface to the caller — after
        // this returns, nothing is listening.
        const record = await registry.get(id);
        if (record === undefined) {
          throw new NotFoundError('source not found', { details: { id } });
        }
        if (statuses.get(id)?.state === 'running') {
          throw new ConflictError('a scan is already running for this source', { details: { id } });
        }

        // Mark running BEFORE yielding, so a second startScan in the same tick is rejected rather
        // than both slipping past the guard.
        const previous = statuses.get(id);
        const status: SourceScanStatus = {
          state: 'running',
          progress: { processed: 0, total: 0 },
          ...(previous?.lastScan !== undefined ? { lastScan: previous.lastScan } : {}),
        };
        statuses.set(id, status);

        // Deliberately not awaited — that is the feature. `performScan` records failure in
        // `statuses` and emits `source.scan.failed`, so the catch here only stops an unhandled
        // rejection from taking the process down; it is not where the error is reported.
        void performScan(registry, id).catch(() => undefined);

        return status;
      },

      async scanStatus(id) {
        // Only report status for a source visible in this tenant view.
        const record = await registry.get(id);
        if (record === undefined) return undefined;
        return statuses.get(id) ?? { state: 'idle' };
      },

      async summary() {
        const records = await registry.list();
        const snapshots = await Promise.all(records.map((record) => manifest.snapshot(record.id)));
        const documents = snapshots.reduce((total, snapshot) => total + snapshot.size, 0);

        let lastScanAt: string | null = null;
        for (const record of records) {
          const at = statuses.get(record.id)?.lastScan?.at;
          if (at !== undefined && (lastScanAt === null || at > lastScanAt)) lastScanAt = at;
        }

        return { sources: records.length, documents, lastScanAt };
      },

      connectorFor(source) {
        return connectors.get(source.id);
      },

      forTenant(tenantId) {
        return viewFor(registry.forTenant(tenantId));
      },

      forProject(projectId) {
        return viewFor(registry.forProject(projectId));
      },
    };
  }

  return viewFor(options.registry);
}
