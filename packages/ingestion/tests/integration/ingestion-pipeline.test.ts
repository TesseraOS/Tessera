import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus, newId } from '@tessera/core';
import { createInProcessQueue } from '@tessera/storage';
import type { SourceDescriptor, IngestionEvents } from '../../src/domain';
import { createFilesystemConnector } from '../../src/connectors/filesystem';
import { createInMemoryManifest } from '../../src/adapters/in-memory-manifest';
import { createInMemoryDocumentSink } from '../../src/adapters/in-memory-sink';
import { createIngestionCoordinator, type ScanSummary } from '../../src/pipeline/coordinator';
import { createIngestionWorker } from '../../src/pipeline/worker';

// AWS's own documented EXAMPLE key id — a fixture, not a real secret.
const AWS_EXAMPLE_KEY = 'AKIAIOSFODNN7EXAMPLE';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tessera-ingest-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(root, 'README.md'), '# Project\n');
  await writeFile(join(root, 'config.txt'), `aws_key = "${AWS_EXAMPLE_KEY}"\n`);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('ingestion pipeline (filesystem → queue → worker → sink)', () => {
  it('ingests incrementally and idempotently, scrubbing secrets before persist', async () => {
    // Arrange — durable state (sink, manifest) outlives each scan's queue+worker.
    const sink = createInMemoryDocumentSink();
    const manifest = createInMemoryManifest();
    const events = createEventBus<IngestionEvents>();
    let ingested = 0;
    let removed = 0;
    events.on('document.ingested', () => {
      ingested += 1;
    });
    events.on('document.removed', () => {
      removed += 1;
    });
    const upsertSpy = vi.spyOn(sink, 'upsert');
    const removeSpy = vi.spyOn(sink, 'remove');

    const source: SourceDescriptor = {
      id: newId<'Source'>(),
      kind: 'filesystem',
      label: root,
    };
    const connector = createFilesystemConnector({ root });

    // A single scan: fresh queue + worker, then drain via shutdown.
    const ingest = async (): Promise<ScanSummary> => {
      const queue = createInProcessQueue();
      createIngestionWorker({ queue, connectors: [connector], sink, manifest, events });
      const summary = await createIngestionCoordinator({
        queue,
        connector,
        source,
        manifest,
      }).scan();
      await queue.shutdown();
      return summary;
    };

    // Act + Assert — initial ingest persists all three files.
    const first = await ingest();
    expect(first).toEqual({ added: 3, modified: 0, removed: 0, unchanged: 0 });
    expect(upsertSpy).toHaveBeenCalledTimes(3);
    expect(sink.size).toBe(3);
    expect(ingested).toBe(3);

    // Secret scrubbing: the planted key is nowhere in any persisted document.
    const configDoc = sink.all().find((document) => document.path === 'config.txt');
    expect(configDoc?.text).not.toContain(AWS_EXAMPLE_KEY);
    expect(configDoc?.redactions).toContainEqual({ detector: 'aws-access-key-id', count: 1 });
    expect(JSON.stringify(sink.all())).not.toContain(AWS_EXAMPLE_KEY);

    // Incremental: modifying one file re-processes only that file (no full re-index).
    upsertSpy.mockClear();
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 2;\n');
    const second = await ingest();
    expect(second).toEqual({ added: 0, modified: 1, removed: 0, unchanged: 2 });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(sink.size).toBe(3);

    // Idempotent: a scan with no changes does no work.
    upsertSpy.mockClear();
    removeSpy.mockClear();
    const third = await ingest();
    expect(third).toEqual({ added: 0, modified: 0, removed: 0, unchanged: 3 });
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    // Removal: deleting a file removes exactly that document.
    removeSpy.mockClear();
    await rm(join(root, 'README.md'));
    const fourth = await ingest();
    expect(fourth).toEqual({ added: 0, modified: 0, removed: 1, unchanged: 2 });
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(sink.size).toBe(2);
    expect(sink.all().some((document) => document.path === 'README.md')).toBe(false);
    expect(removed).toBe(1);
  });
});
