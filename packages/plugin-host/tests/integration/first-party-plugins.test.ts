import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Connector } from '@tessera/ingestion';
import type { Embeddings } from '@tessera/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { createPluginHost } from '../../src/host';
import { fakeEmbeddingsPlugin } from '../../src/plugins/embeddings';
import { filesystemConnectorPlugin } from '../../src/plugins/filesystem-connector';

/** First-party connector + embeddings load through the host on the same contract as third parties. */
describe('first-party plugins via the host', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('loads the filesystem connector plugin and lists files through its capability', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-plugin-fs-'));
    await writeFile(join(dir, 'a.txt'), 'hello', 'utf8');

    const host = createPluginHost();
    host.register(filesystemConnectorPlugin);

    const info = await host.load('tessera.connector.filesystem', { root: dir });
    expect(info.status).toBe('loaded');

    const connector = host.capability<Connector>('tessera.connector.filesystem');
    expect(connector?.kind).toBe('filesystem');
    const entries = await connector!.list();
    expect(entries.map((entry) => entry.path)).toContain('a.txt');
  });

  it('rejects an invalid connector config (missing root) as failed', async () => {
    const host = createPluginHost();
    host.register(filesystemConnectorPlugin);
    expect((await host.load('tessera.connector.filesystem', {})).status).toBe('failed');
  });

  it('loads the fake embeddings plugin and produces vectors of the configured dimension', async () => {
    const host = createPluginHost();
    host.register(fakeEmbeddingsPlugin);

    await host.load('tessera.ai.fake-embeddings', { dimension: 16 });
    const embeddings = host.capability<Embeddings>('tessera.ai.fake-embeddings');
    expect(embeddings?.info.dimension).toBe(16);
    expect(await embeddings!.embed('hello')).toHaveLength(16);
  });
});
