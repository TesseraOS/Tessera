import Database from 'better-sqlite3';
import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Snapshot a SQLite database file to `destPath` using SQLite's **online backup** (safe to run while the
 * source is in use; the WAL is consolidated into a single consistent file). Overwrites `destPath`.
 */
export async function backupSqlite(sourcePath: string, destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  const source = new Database(sourcePath, { readonly: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }
}

/**
 * Restore a SQLite backup over `destPath`. The target database must be **closed**. Any stale WAL/SHM
 * sidecars are removed first so they can't shadow the restored snapshot.
 */
export async function restoreSqlite(backupPath: string, destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  await Promise.all([
    rm(`${destPath}-wal`, { force: true }),
    rm(`${destPath}-shm`, { force: true }),
  ]);
  await copyFile(backupPath, destPath);
}

/** Recursively back up a directory (e.g. the filesystem blob store) to `destDir`, replacing its contents. */
export async function backupDirectory(sourceDir: string, destDir: string): Promise<void> {
  await rm(destDir, { recursive: true, force: true });
  await cp(sourceDir, destDir, { recursive: true });
}

/** Restore a directory backup over `destDir`, replacing its contents. */
export async function restoreDirectory(backupDir: string, destDir: string): Promise<void> {
  await rm(destDir, { recursive: true, force: true });
  await cp(backupDir, destDir, { recursive: true });
}
