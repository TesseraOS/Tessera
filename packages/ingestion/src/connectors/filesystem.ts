import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { RawDocument, SourceEntry } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import { contentHashOf } from '../hash.js';
import { relativeKeyToAbsolute } from './paths.js';

/** Directories skipped by default — build output, VCS internals, and dependency trees. */
const DEFAULT_IGNORED_DIRECTORIES: readonly string[] = ['.git', 'node_modules', 'dist', '.turbo'];

export interface FilesystemConnectorOptions {
  /** Directory to ingest. */
  readonly root: string;
  /** Directory names to skip (replaces the default set when provided). */
  readonly ignoredDirectories?: readonly string[];
}

/**
 * First-party filesystem {@link Connector}: walks a directory tree, skipping ignored directories,
 * and exposes each file as a hashed entry. Source-relative keys are `/`-delimited and resolved
 * under `root`; `.`/`..` segments are rejected to prevent path traversal (the BlobStore pattern).
 */
export function createFilesystemConnector(options: FilesystemConnectorOptions): Connector {
  const rootAbs = resolve(options.root);
  const ignored = new Set(options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES);

  function isErrno(error: unknown, code: string): boolean {
    return (error as NodeJS.ErrnoException | null)?.code === code;
  }

  async function walk(directory: string, entries: SourceEntry[]): Promise<void> {
    const dirents = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      dirents.map(async (dirent) => {
        const absolute = join(directory, dirent.name);
        if (dirent.isDirectory()) {
          if (ignored.has(dirent.name)) return;
          await walk(absolute, entries);
          return;
        }
        if (!dirent.isFile()) return;
        const bytes = await readFile(absolute);
        const path = relative(rootAbs, absolute).split(sep).join('/');
        entries.push({ path, contentHash: contentHashOf(bytes) });
      }),
    );
  }

  return {
    kind: 'filesystem',

    async list() {
      const entries: SourceEntry[] = [];
      await walk(rootAbs, entries);
      return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },

    async resolve(path): Promise<RawDocument | undefined> {
      const absolute = relativeKeyToAbsolute(rootAbs, path);
      try {
        const [bytes, info] = await Promise.all([readFile(absolute), stat(absolute)]);
        return {
          path,
          bytes,
          contentHash: contentHashOf(bytes),
          metadata: {
            connector: 'filesystem',
            sizeBytes: info.size,
            modifiedAt: info.mtime.toISOString(),
          },
        };
      } catch (error) {
        if (isErrno(error, 'ENOENT')) return undefined;
        throw error;
      }
    },
  };
}
