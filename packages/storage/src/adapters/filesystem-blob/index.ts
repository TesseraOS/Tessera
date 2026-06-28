import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ValidationError } from '@tessera/core';
import type { BlobStore } from '../../ports/blob.js';

export interface FilesystemBlobOptions {
  /** Directory under which all blobs are stored. */
  readonly root: string;
}

/**
 * Filesystem {@link BlobStore} (the local default). Keys are `/`-delimited and resolved under
 * `root`; `.`/`..` segments are rejected to prevent path traversal. An S3-compatible adapter
 * implements the same contract for cloud (ADR-0003).
 */
export function createFilesystemBlobStore(options: FilesystemBlobOptions): BlobStore {
  const rootAbs = resolve(options.root);

  function keyToPath(key: string): string {
    const segments = key.split('/').filter((segment) => segment.length > 0);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new ValidationError('blob key must not contain "." or ".." segments', {
        details: { key },
      });
    }
    if (segments.length === 0) {
      throw new ValidationError('blob key must not be empty', { details: { key } });
    }
    return join(rootAbs, ...segments);
  }

  function isErrno(error: unknown, code: string): boolean {
    return (error as NodeJS.ErrnoException | null)?.code === code;
  }

  return {
    async put(key, data) {
      const path = keyToPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },

    async get(key) {
      try {
        return await readFile(keyToPath(key));
      } catch (error) {
        if (isErrno(error, 'ENOENT')) return undefined;
        throw error;
      }
    },

    async delete(key) {
      await rm(keyToPath(key), { force: true });
    },

    async exists(key) {
      try {
        await stat(keyToPath(key));
        return true;
      } catch (error) {
        if (isErrno(error, 'ENOENT')) return false;
        throw error;
      }
    },

    async list(prefix) {
      if (!existsSync(rootAbs)) return [];
      const entries = await readdir(rootAbs, { recursive: true, withFileTypes: true });
      const keys = entries
        .filter((entry) => entry.isFile())
        .map((entry) => relative(rootAbs, join(entry.parentPath, entry.name)).split(sep).join('/'));
      return prefix === undefined ? keys : keys.filter((key) => key.startsWith(prefix));
    },
  };
}
