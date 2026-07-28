import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/load';
import { createLocalRuntime } from '../../src/profiles/local';
import type { Runtime } from '../../src/runtime';

/**
 * Background scan outcomes reach the audit trail (F-065).
 *
 * The gap this closes: since F-081 `POST /v1/sources/:id/scan` answers **202** and the work happens
 * afterwards, so the `source.manage` row the boundary records means "a scan was started" and the
 * trail said nothing about how it ended. These are the rows that make `scan.completed` /
 * `scan.failed` derivable as notifications — and they are written by the composition root's
 * ingestion→SSE bridge, which is the only place that sees a terminal event *and* holds the trail.
 */
describe('background scan outcomes in the audit trail (F-065)', () => {
  let runtime: Runtime | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  async function makeRuntime(): Promise<Runtime> {
    const dataDir = await tempDir('tessera-scan-audit-data-');
    return createLocalRuntime(
      loadConfig({
        TESSERA_SQLITE_PATH: ':memory:',
        TESSERA_VECTOR_PATH: ':memory:',
        TESSERA_BLOB_ROOT: join(dataDir, 'blobs'),
        TESSERA_EMBEDDINGS_PROVIDER: 'fake',
        TESSERA_EMBEDDINGS_DIMENSION: '8',
      }),
    );
  }

  async function writeRepo(root: string): Promise<void> {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'README.md'), '# Project\n');
  }

  it('records a completion attributed to the principal that started the scan', async () => {
    const rt = (runtime = await makeRuntime());
    const audit = rt.audit;
    // Auditing is on by default in the local profile; if that ever changes, this test must be told
    // rather than silently passing over an absent trail.
    expect(audit).toBeDefined();

    const repo = await tempDir('tessera-scan-audit-repo-');
    await writeRepo(repo);

    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    await rt.services.sources.scan(source.id, {
      actor: { principalId: 'user-42', kind: 'user' },
    });

    // The bridge subscriber is failure-isolated and therefore not awaited by the scan.
    await vi.waitFor(async () => {
      const { events } = await audit!.query({ action: 'source.scan.completed' });
      expect(events).toHaveLength(1);
    });

    const [event] = (await audit!.query({ action: 'source.scan.completed' })).events;
    expect(event).toMatchObject({
      action: 'source.scan.completed',
      actor: { principalId: 'user-42', kind: 'user' },
      outcome: 'success',
      target: source.id,
    });
    // Counts, not content — the trail holds no ingested text (NFR-7).
    expect(event?.metadata).toEqual({ added: 1, modified: 0, removed: 0 });
  });

  it('records a failure — the outcome the 202 response could never carry', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-scan-audit-repo-');
    await writeRepo(repo);

    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    // Delete the root out from under the scan so listing fails after the source is registered.
    await rm(repo, { recursive: true, force: true });

    await rt.services.sources
      .scan(source.id, { actor: { principalId: 'tok_1', kind: 'token' } })
      .catch(() => undefined);

    await vi.waitFor(async () => {
      const { events } = await rt.audit!.query({ action: 'source.scan.failed' });
      expect(events).toHaveLength(1);
    });

    const [event] = (await rt.audit!.query({ action: 'source.scan.failed' })).events;
    expect(event).toMatchObject({
      action: 'source.scan.failed',
      actor: { principalId: 'tok_1', kind: 'token' },
      target: source.id,
    });
    // The connector's message can quote a path or a remote's response, so it stays out of the trail
    // (NFR-7) — the source's status and the logs hold the detail.
    expect(event?.metadata).toBeUndefined();
  });

  it('writes NO row for an unattributed scan, rather than inventing a system actor', async () => {
    const rt = (runtime = await makeRuntime());
    const repo = await tempDir('tessera-scan-audit-repo-');
    await writeRepo(repo);

    const source = await rt.services.sources.register({
      kind: 'filesystem',
      config: { root: repo },
    });
    await rt.services.sources.scan(source.id);

    // Wait for a fact that DOES happen, so this is not just "we did not wait long enough": the
    // scan's own summary is already resolved above, and the bridge subscriber runs synchronously
    // with the emit, so any row it was going to write exists by now.
    const { events } = await rt.audit!.query({ action: 'source.scan.completed' });
    expect(events).toEqual([]);
  });
});
