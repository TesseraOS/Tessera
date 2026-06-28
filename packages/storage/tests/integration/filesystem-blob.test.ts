import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesystemBlobStore } from '../../src/adapters/filesystem-blob/index';
import { runBlobConformance } from '../conformance/blob.conformance';

// The filesystem BlobStore adapter must satisfy the shared BlobStore contract.
runBlobConformance('filesystem', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tessera-blob-'));
  return {
    store: createFilesystemBlobStore({ root }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
});
