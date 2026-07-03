import { sql } from 'drizzle-orm';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteStore } from '../../src/adapters/sqlite-relational/index';
import {
  backupDirectory,
  backupSqlite,
  restoreDirectory,
  restoreSqlite,
} from '../../src/backup/backup';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tessera-backup-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('sqlite backup/restore', () => {
  it('round-trips: seed → backup → mutate → restore → data matches the backup', async () => {
    const dbPath = join(dir, 'app.sqlite');
    const backupPath = join(dir, 'app.bak.sqlite');

    const store = createSqliteStore({ path: dbPath });
    store.db.run(sql`CREATE TABLE t (id integer primary key, v text not null)`);
    store.db.run(sql`INSERT INTO t (v) VALUES ('original')`);
    await backupSqlite(dbPath, backupPath); // online backup while open
    store.db.run(sql`UPDATE t SET v = 'changed'`);
    await store.close();

    await restoreSqlite(backupPath, dbPath);
    const restored = createSqliteStore({ path: dbPath });
    try {
      expect(restored.db.all<{ v: string }>(sql`SELECT v FROM t`)[0]?.v).toBe('original');
    } finally {
      await restored.close();
    }
  });
});

describe('directory backup/restore', () => {
  it('round-trips a directory tree (e.g. the blob store)', async () => {
    const src = join(dir, 'blobs');
    const bak = join(dir, 'blobs.bak');
    await mkdir(join(src, 'sub'), { recursive: true });
    await writeFile(join(src, 'a.txt'), 'A');
    await writeFile(join(src, 'sub', 'b.txt'), 'B');

    await backupDirectory(src, bak);
    await rm(src, { recursive: true, force: true }); // simulate loss
    await restoreDirectory(bak, src);

    expect(await readFile(join(src, 'a.txt'), 'utf8')).toBe('A');
    expect(await readFile(join(src, 'sub', 'b.txt'), 'utf8')).toBe('B');
  });
});
