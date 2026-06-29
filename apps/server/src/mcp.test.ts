import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Runtime } from '@tessera/config';
import { buildMcpServer } from '@tessera/mcp';
import { afterEach, describe, expect, it } from 'vitest';
import { createServerRuntime } from './bootstrap.js';

/** The MCP bin is `createServerRuntime` + `startMcpStdio` (stdio); here we cover the composition. */
describe('MCP server composition', () => {
  let runtime: Runtime | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('builds an MCP server over a booted local runtime whose services work', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tessera-server-mcp-'));
    runtime = await createServerRuntime({
      config: {
        storage: { sqlitePath: ':memory:', vectorPath: ':memory:', blobRoot: join(dir, 'blobs') },
        embeddings: { provider: 'fake', dimension: 8 },
      },
    });

    const server = buildMcpServer(runtime.services);
    expect(server).toBeTruthy();

    const captured = await runtime.services.memory.capture({
      kind: 'lesson',
      title: 't',
      body: 'b',
    });
    expect(captured.version).toBe(1);
  });
});
