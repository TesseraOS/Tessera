import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@tessera/core';
import { createInProcessQueue } from '@tessera/storage';
import type { SourceDescriptor } from '../../src/domain';
import { createFilesystemConnector } from '../../src/connectors/filesystem';
import { createInMemoryManifest } from '../../src/adapters/in-memory-manifest';
import { createInMemoryDocumentSink } from '../../src/adapters/in-memory-sink';
import { createMemoryExtractionSink } from '../../src/adapters/memory-extraction-sink';
import { teeSink } from '../../src/adapters/tee-sink';
import { defaultMemoryExtractors } from '../../src/extraction/extract';
import { createIngestionCoordinator, type ScanSummary } from '../../src/pipeline/coordinator';
import { createIngestionWorker } from '../../src/pipeline/worker';
import { createFakeMemoryService } from '../support/fake-memory-service';

const adrPath = join('docs', 'adr', '0024-github-connector.md');

function adr(decision: string): string {
  return [
    '# ADR-0024: GitHub connector via REST fetch',
    '',
    '- **Status:** Accepted',
    '',
    '## Decision',
    '',
    decision,
    '',
    '## Consequences',
    '',
    'Documented.',
  ].join('\n');
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tessera-automem-'));
  await mkdir(join(root, 'docs', 'adr'), { recursive: true });
  await writeFile(join(root, adrPath), adr('We will use native fetch.'));
  await writeFile(join(root, 'README.md'), '# Project\n\nJust documentation, no decision.\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('auto memory extraction (filesystem → pipeline → memory)', () => {
  it('captures a decision from an ingested ADR, idempotently, superseding on change', async () => {
    const memory = createFakeMemoryService();
    const persist = createInMemoryDocumentSink();
    const manifest = createInMemoryManifest();
    const connector = createFilesystemConnector({ root });
    const source: SourceDescriptor = { id: newId<'Source'>(), kind: 'filesystem', label: root };
    const sink = teeSink(
      persist,
      createMemoryExtractionSink({ memory, extractors: defaultMemoryExtractors }),
    );

    const ingest = async (): Promise<ScanSummary> => {
      const queue = createInProcessQueue();
      createIngestionWorker({ queue, connectors: [connector], sink, manifest });
      const summary = await createIngestionCoordinator({
        queue,
        connector,
        source,
        manifest,
      }).scan();
      await queue.shutdown();
      return summary;
    };

    // First ingest: both files persisted; only the ADR yields a memory.
    const first = await ingest();
    expect(first).toEqual({ added: 2, modified: 0, removed: 0, unchanged: 0 });
    expect(persist.size).toBe(2);
    expect(memory.current()).toHaveLength(1);
    const [decision] = memory.current();
    expect(decision?.kind).toBe('decision');
    expect(decision?.metadata.source).toBe('adr:0024');
    expect(decision?.body).toBe('We will use native fetch.');

    // Re-scan with no changes: no re-processing, no duplicate memory (idempotent).
    const second = await ingest();
    expect(second).toEqual({ added: 0, modified: 0, removed: 0, unchanged: 2 });
    expect(memory.current()).toHaveLength(1);
    expect(memory.allVersions()).toHaveLength(1);

    // Editing the ADR's decision supersedes the memory (a new version, still one current).
    await writeFile(join(root, adrPath), adr('We will use native fetch and inject the client.'));
    const third = await ingest();
    expect(third).toEqual({ added: 0, modified: 1, removed: 0, unchanged: 1 });
    expect(memory.current()).toHaveLength(1);
    expect(memory.current()[0]?.version).toBe(2);
    expect(memory.current()[0]?.body).toBe('We will use native fetch and inject the client.');
    expect(memory.allVersions()).toHaveLength(2);
  });
});
