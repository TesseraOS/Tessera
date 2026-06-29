import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { InternalError } from '@tessera/core';
import type { DocumentMetadata, RawDocument, SourceEntry } from '../domain.js';
import type { Connector } from '../ports/connector.js';
import { contentHashOf } from '../hash.js';
import { relativeKeyToAbsolute } from './paths.js';

const execFileAsync = promisify(execFile);

/** Generous buffer for `ls-files` on large repositories. */
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface GitConnectorOptions {
  /** Path to the working tree of a Git repository. */
  readonly root: string;
}

/** Repo-level provenance captured once per scan (FR-2: authorship, branch, tags, HEAD commit). */
interface GitRepoMetadata {
  readonly branch: string;
  readonly headCommit: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly committedAt: string;
  readonly tags: readonly string[];
}

/**
 * First-party git {@link Connector}: ingests the **tracked** working-tree files (so `.gitignore` is
 * honored and untracked/build artifacts are skipped) and enriches every document with repo-level
 * git provenance — current branch, HEAD commit, authorship, and tags at HEAD (FR-2).
 *
 * It shells out to the `git` CLI via `execFile` (fixed argument arrays, no shell — ingested content
 * is never executed) rather than adding a JS git dependency, keeping the package dependency-free
 * (ADR-0015). Full per-file history/diff/blame is a later increment; this captures HEAD provenance.
 */
export function createGitConnector(options: GitConnectorOptions): Connector {
  const rootAbs = resolve(options.root);
  let repoMetadataCache: Promise<GitRepoMetadata | undefined> | undefined;

  async function runGit(args: readonly string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', rootAbs, ...args], {
        windowsHide: true,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        encoding: 'utf8',
      });
      return stdout;
    } catch (error) {
      throw new InternalError('git command failed', { cause: error, details: { args } });
    }
  }

  async function loadRepoMetadata(): Promise<GitRepoMetadata | undefined> {
    try {
      const [log, branch, tags] = await Promise.all([
        runGit(['log', '-1', '--format=%H%n%an%n%ae%n%aI%n%s']),
        runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
        runGit(['tag', '--points-at', 'HEAD']),
      ]);
      const [headCommit = '', author = '', authorEmail = '', committedAt = ''] = log.split('\n');
      return {
        branch: branch.trim(),
        headCommit,
        author,
        authorEmail,
        committedAt,
        tags: tags
          .split('\n')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      };
    } catch {
      // An empty repository (no commits) or detached state — degrade to no repo metadata.
      return undefined;
    }
  }

  function repoMetadata(): Promise<GitRepoMetadata | undefined> {
    repoMetadataCache ??= loadRepoMetadata();
    return repoMetadataCache;
  }

  return {
    kind: 'git',

    async list() {
      const stdout = await runGit(['ls-files', '-z']);
      const paths = stdout.split('\0').filter((path) => path.length > 0);
      const entries = await Promise.all(
        paths.map(async (path): Promise<SourceEntry | undefined> => {
          try {
            const bytes = await readFile(relativeKeyToAbsolute(rootAbs, path));
            return { path, contentHash: contentHashOf(bytes) };
          } catch {
            // Tracked but missing in the working tree (e.g. deleted-not-staged) — skip; the diff
            // will surface it as a removal once it leaves the index.
            return undefined;
          }
        }),
      );
      return entries
        .filter((entry): entry is SourceEntry => entry !== undefined)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },

    async resolve(path): Promise<RawDocument | undefined> {
      let bytes: Buffer;
      try {
        bytes = await readFile(relativeKeyToAbsolute(rootAbs, path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined;
        throw error;
      }
      const git = await repoMetadata();
      const metadata: DocumentMetadata =
        git === undefined ? { connector: 'git' } : { connector: 'git', git };
      return { path, bytes, contentHash: contentHashOf(bytes), metadata };
    },
  };
}
