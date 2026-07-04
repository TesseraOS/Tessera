import { createEventBus } from '@tessera/core';
import { createInProcessQueue } from '@tessera/storage';
import { describe, expect, it } from 'vitest';
import { createInMemoryDocumentSink } from '../adapters/in-memory-sink.js';
import type { IngestionEvents, RawDocument, SourceEntry } from '../domain.js';
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

  return { service, sink, worker, seen };
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
