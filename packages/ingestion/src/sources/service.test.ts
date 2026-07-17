import { createEventBus } from '@tessera/core';
import { createInProcessQueue } from '@tessera/storage';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDocumentSink } from '../adapters/in-memory-sink.js';
import type { IngestionEvents, RawDocument, SourceEntry, SourceId } from '../domain.js';
import { contentHashOf } from '../hash.js';
import type { Connector } from '../ports/connector.js';
import { createInMemoryManifest } from '../adapters/in-memory-manifest.js';
import { createIngestionWorker } from '../pipeline/worker.js';
import { createInMemorySourceRegistry, type SourceRecord } from './registry.js';
import { createSourceService } from './service.js';

const encoder = new TextEncoder();

/** A connector over an in-memory `path → content` map, so tests exercise the real pipeline offline. */
function fakeConnector(files: Map<string, string>): Connector {
  return {
    kind: 'fake',
    list(): Promise<readonly SourceEntry[]> {
      return Promise.resolve(
        [...files.entries()]
          .map(([path, content]) => ({ path, contentHash: contentHashOf(encoder.encode(content)) }))
          .sort((a, b) => (a.path < b.path ? -1 : 1)),
      );
    },
    resolve(path): Promise<RawDocument | undefined> {
      const content = files.get(path);
      if (content === undefined) return Promise.resolve(undefined);
      const bytes = encoder.encode(content);
      return Promise.resolve({
        path,
        bytes,
        contentHash: contentHashOf(bytes),
        metadata: { connector: 'fake' },
      });
    },
  };
}

/** Wire a service + a worker sharing one event bus + sink, over a `root → files` filesystem map. */
function harness(
  filesystems: Map<string, Map<string, string>>,
  options: { autoScanOnRegister?: boolean } = {},
) {
  const queue = createInProcessQueue();
  const manifest = createInMemoryManifest();
  const registry = createInMemorySourceRegistry();
  const events = createEventBus<IngestionEvents>();
  const sink = createInMemoryDocumentSink();

  const connectorFactory = (record: SourceRecord): Connector => {
    if (record.kind !== 'fake') {
      throw new Error(`unsupported kind ${record.kind}`);
    }
    const root = String(record.config['root']);
    const files = filesystems.get(root);
    if (files === undefined) throw new Error(`no filesystem for root ${root}`);
    return fakeConnector(files);
  };

  const service = createSourceService({
    registry,
    queue,
    manifest,
    connectorFactory,
    events,
    ...(options.autoScanOnRegister !== undefined
      ? { autoScanOnRegister: options.autoScanOnRegister }
      : {}),
  });
  const worker = createIngestionWorker({
    queue,
    connectors: [],
    connectorFor: service.connectorFor,
    sink,
    manifest,
    events,
  });

  const seen: string[] = [];
  events.on('source.scan.started', () => void seen.push('started'));
  events.on('source.scan.completed', () => void seen.push('completed'));
  events.on('document.ingested', (e) => void seen.push(`ingested:${e.document.path}`));
  events.on('document.removed', (e) => void seen.push(`removed:${e.path}`));

  return { service, sink, worker, seen, events };
}

describe('createSourceService', () => {
  it('registers a source and scans it end-to-end (documents reach the sink)', async () => {
    const files = new Map([
      ['a.md', '# A'],
      ['b.ts', 'const b = 1;'],
    ]);
    const { service, sink, seen } = harness(new Map([['/repo', files]]));

    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });
    const { summary } = await service.scan(source.id);

    expect(summary).toEqual({ added: 2, modified: 0, removed: 0, unchanged: 0 });
    // The drain barrier: documents are fully persisted by the time scan() resolves (synchronous scan).
    expect(sink.size).toBe(2);
    // Scan lifecycle + per-document events streamed through the ingestion bus (bridged to SSE later).
    // `started` is emitted before the scan runs; the document events + `completed` all fire during it.
    expect(seen[0]).toBe('started');
    expect(seen).toContain('ingested:a.md');
    expect(seen).toContain('ingested:b.ts');
    expect(seen).toContain('completed');

    const status = await service.scanStatus(source.id);
    expect(status?.state).toBe('idle');
    expect(status?.lastScan?.summary.added).toBe(2);
  });

  it('summary counts this tenant sources + documents and the latest scan time', async () => {
    const { service } = harness(
      new Map([
        [
          '/repo',
          new Map([
            ['a.md', '# A'],
            ['b.ts', 'const b = 1;'],
          ]),
        ],
        ['/other', new Map([['c.md', '# C']])],
      ]),
    );

    // An empty workspace is honestly empty — not "unknown".
    expect(await service.summary()).toEqual({ sources: 0, documents: 0, lastScanAt: null });

    const first = await service.register({ kind: 'fake', config: { root: '/repo' } });
    // Registered but never scanned: the source counts, its documents do not yet exist.
    expect(await service.summary()).toEqual({ sources: 1, documents: 0, lastScanAt: null });

    await service.scan(first.id);
    const afterFirst = await service.summary();
    expect(afterFirst.sources).toBe(1);
    expect(afterFirst.documents).toBe(2);
    expect(afterFirst.lastScanAt).not.toBeNull();

    const second = await service.register({ kind: 'fake', config: { root: '/other' } });
    await service.scan(second.id);
    const afterSecond = await service.summary();
    expect(afterSecond.sources).toBe(2);
    expect(afterSecond.documents).toBe(3); // summed across both sources' manifests
    // The latest scan across the tenant's sources wins.
    expect(afterSecond.lastScanAt).not.toBeNull();
    expect(afterSecond.lastScanAt! >= afterFirst.lastScanAt!).toBe(true);
  });

  it('summary is tenant-scoped — one tenant never counts another documents', async () => {
    const { service } = harness(
      new Map([
        [
          '/repo',
          new Map([
            ['a.md', '# A'],
            ['b.ts', 'const b = 1;'],
          ]),
        ],
        ['/other', new Map([['c.md', '# C']])],
      ]),
    );
    const a = service.forTenant('tenant-a');
    const b = service.forTenant('tenant-b');

    const ownedByA = await a.register({ kind: 'fake', config: { root: '/repo' } });
    await a.scan(ownedByA.id);
    const ownedByB = await b.register({ kind: 'fake', config: { root: '/other' } });
    await b.scan(ownedByB.id);

    expect(await a.summary()).toMatchObject({ sources: 1, documents: 2 });
    expect(await b.summary()).toMatchObject({ sources: 1, documents: 1 });
    // The default view is a distinct tenant and owns nothing.
    expect(await service.summary()).toEqual({ sources: 0, documents: 0, lastScanAt: null });
  });

  it('is incremental + idempotent on re-scan (no changes → no re-index)', async () => {
    const files = new Map([['a.md', '# A']]);
    const { service, sink } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    await service.scan(source.id);
    const second = await service.scan(source.id);
    expect(second.summary).toEqual({ added: 0, modified: 0, removed: 0, unchanged: 1 });
    expect(sink.size).toBe(1);
  });

  it('detects modifications and removals on re-scan', async () => {
    const files = new Map([
      ['a.md', '# A'],
      ['b.ts', 'const b = 1;'],
    ]);
    const { service, sink } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });
    await service.scan(source.id);

    files.set('a.md', '# A (edited)');
    const modified = await service.scan(source.id);
    expect(modified.summary.modified).toBe(1);

    files.delete('b.ts');
    const removed = await service.scan(source.id);
    expect(removed.summary.removed).toBe(1);
    expect(sink.size).toBe(1); // only a.md remains
  });

  it('rejects an unsupported connector kind and does not leave a record', async () => {
    const { service } = harness(new Map());
    await expect(service.register({ kind: 'nope', config: {} })).rejects.toThrow();
    expect(await service.list()).toHaveLength(0);
  });

  it('throws NOT_FOUND scanning an unknown source', async () => {
    const { service } = harness(new Map());
    await expect(service.scan('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('scans immediately on register when autoScanOnRegister is set', async () => {
    const files = new Map([['a.md', '# A']]);
    const { service, sink } = harness(new Map([['/repo', files]]), { autoScanOnRegister: true });

    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });
    // The document is already persisted by the time register() resolves (no explicit scan call).
    expect(sink.size).toBe(1);
    const status = await service.scanStatus(source.id);
    expect(status?.lastScan?.summary.added).toBe(1);
  });

  it('scopes sources by tenant (forTenant)', async () => {
    const files = new Map([['a.md', '# A']]);
    const { service } = harness(new Map([['/repo', files]]));
    const inA = await service
      .forTenant('tenant-a')
      .register({ kind: 'fake', config: { root: '/repo' } });

    expect(await service.forTenant('tenant-b').get(inA.id)).toBeUndefined();
    expect(await service.forTenant('tenant-b').list()).toHaveLength(0);
    // b cannot scan a's source.
    await expect(service.forTenant('tenant-b').scan(inA.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/**
 * F-081 — scans as background jobs.
 *
 * The defect: `scan()` awaited the coordinator AND `queue.drain()`, so an HTTP caller held a request
 * open for the entire ingest, and nothing counted progress — which is why the dashboard could only
 * show an unbounded spinner. `scan()` deliberately keeps that behaviour (MCP's `scan_source` returns
 * the summary, and an agent wants the answer); `startScan()` is the non-blocking entry.
 */
describe('startScan', () => {
  it('returns before the work is done, and reports running', async () => {
    const files = new Map([
      ['a.md', '# A'],
      ['b.ts', 'const b = 1;'],
    ]);
    const { service, sink } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    const status = await service.startScan(source.id);

    // The whole point: accepted, not finished. Nothing has reached the sink yet — the jobs are still
    // on the microtask queue. If this ever reads 2, startScan has silently become synchronous again.
    expect(status.state).toBe('running');
    expect(sink.size).toBe(0);

    await vi.waitFor(async () => {
      expect((await service.scanStatus(source.id))?.state).toBe('idle');
    });
    expect(sink.size).toBe(2);
  });

  it('counts real progress, monotonically, and reaches total', async () => {
    const files = new Map([
      ['a.md', '# A'],
      ['b.ts', 'const b = 1;'],
      ['c.ts', 'const c = 2;'],
    ]);
    const { service, events } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    const progress: { processed: number; total: number }[] = [];
    events.on(
      'source.scan.progress',
      (e) => void progress.push({ processed: e.processed, total: e.total }),
    );

    await service.startScan(source.id);
    await vi.waitFor(async () => {
      expect((await service.scanStatus(source.id))?.state).toBe('idle');
    });

    // A determinate bar needs both halves: it must actually finish, and it must never go backwards.
    expect(progress.at(-1)).toEqual({ processed: 3, total: 3 });
    expect(progress.map((p) => p.processed)).toEqual([...progress.map((p) => p.processed)].sort());
    expect((await service.scanStatus(source.id))?.lastScan?.summary).toMatchObject({ added: 3 });
  });

  it('counts a re-scanned unchanged document as processed — the bar must not stall', async () => {
    // The trap this feature exists to avoid. The worker returns SILENTLY when a path's persisted
    // hash already matches, so `document.ingested` never fires for it. A progress counter watching
    // ingested/removed would stick below total forever on a no-op re-scan — a bar stuck at 90% is
    // worse than no bar. `document.processed` fires regardless, which is why it exists.
    const files = new Map([['a.md', '# A']]);
    const { service, events } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    await service.scan(source.id); // first pass: indexed
    files.set('a.md', '# A changed'); // modify, so the diff enqueues it again

    const progress: number[] = [];
    events.on('source.scan.progress', (e) => void progress.push(e.processed));

    await service.startScan(source.id);
    await vi.waitFor(async () => {
      expect((await service.scanStatus(source.id))?.state).toBe('idle');
    });

    expect(progress.at(-1)).toBe(1);
  });

  it('rejects a second scan while one is running, rather than racing the manifest', async () => {
    const files = new Map([['a.md', '# A']]);
    const { service } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    await service.startScan(source.id);
    // Two coordinators over one manifest is not a scan, it is a data race.
    await expect(service.startScan(source.id)).rejects.toMatchObject({ code: 'CONFLICT' });

    await vi.waitFor(async () => {
      expect((await service.scanStatus(source.id))?.state).toBe('idle');
    });
    // Once it settles, scanning again is fine.
    await expect(service.startScan(source.id)).resolves.toMatchObject({ state: 'running' });
  });

  it('rejects an unknown source up front, while the caller is still listening', async () => {
    const { service } = harness(new Map([['/repo', new Map()]]));
    await expect(service.startScan('missing-source' as SourceId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('surfaces a failure that happens AFTER acceptance, in status and on the stream', async () => {
    // The hard case, and the reason `source.scan.failed` exists: by the time this throws, the
    // request that started it has already been answered. If the error is not recorded and emitted,
    // it reaches nobody and the UI shows a scan that simply never finishes.
    const files = new Map([['a.md', '# A']]);
    const { service, events } = harness(new Map([['/repo', files]]));
    const source = await service.register({ kind: 'fake', config: { root: '/repo' } });

    const failures: string[] = [];
    events.on('source.scan.failed', (e) => void failures.push(e.error));

    // Break listing after registration, so acceptance succeeds and the background scan then fails.
    files.clear();
    const connector = service.connectorFor({ id: source.id, kind: 'fake', label: source.label });
    connector!.list = () => Promise.reject(new Error('connector exploded'));

    await expect(service.startScan(source.id)).resolves.toMatchObject({ state: 'running' });

    await vi.waitFor(async () => {
      expect((await service.scanStatus(source.id))?.state).toBe('error');
    });
    expect((await service.scanStatus(source.id))?.error).toContain('connector exploded');
    expect(failures).toEqual(['connector exploded']);
  });

  it('a tenant cannot start a scan on a source it cannot see', async () => {
    const files = new Map([['a.md', '# A']]);
    const { service } = harness(new Map([['/repo', files]]));
    const inA = await service
      .forTenant('tenant-a')
      .register({ kind: 'fake', config: { root: '/repo' } });

    await expect(service.forTenant('tenant-b').startScan(inA.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
