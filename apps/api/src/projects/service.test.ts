import { describe, expect, it } from 'vitest';
import { ConflictError, DEFAULT_PROJECT_ID, NotFoundError, ValidationError } from '@tessera/core';
import { createInMemoryProjectStore } from './store.js';
import { createProjectService } from './service.js';
import { DEFAULT_PROJECT_NAME, MAX_PROJECT_NAME_LENGTH } from './model.js';

function service() {
  return createProjectService(createInMemoryProjectStore());
}

describe('ProjectService', () => {
  it('always lists the reserved default project first, before any created project', async () => {
    const svc = service();
    const list0 = await svc.list('t1');
    expect(list0).toHaveLength(1);
    expect(list0[0]?.id).toBe(DEFAULT_PROJECT_ID);
    expect(list0[0]?.isDefault).toBe(true);
    expect(list0[0]?.name).toBe(DEFAULT_PROJECT_NAME);

    const created = await svc.create('t1', { name: 'Alpha' });
    const list1 = await svc.list('t1');
    expect(list1.map((p) => p.id)).toEqual([DEFAULT_PROJECT_ID, created.id]);
    expect(created.isDefault).toBe(false);
  });

  it('get resolves the synthesized default and a stored project; unknown → undefined', async () => {
    const svc = service();
    expect((await svc.get('t1', DEFAULT_PROJECT_ID))?.isDefault).toBe(true);
    const created = await svc.create('t1', { name: 'Alpha' });
    expect((await svc.get('t1', created.id))?.name).toBe('Alpha');
    expect(await svc.get('t1', 'nope')).toBeUndefined();
  });

  it('trims names and rejects empty / over-long ones', async () => {
    const svc = service();
    const created = await svc.create('t1', { name: '  Padded  ' });
    expect(created.name).toBe('Padded');
    await expect(svc.create('t1', { name: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.create('t1', { name: 'x'.repeat(MAX_PROJECT_NAME_LENGTH + 1) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a duplicate name (case-insensitive), including the reserved default name', async () => {
    const svc = service();
    await svc.create('t1', { name: 'Alpha' });
    await expect(svc.create('t1', { name: 'alpha' })).rejects.toBeInstanceOf(ConflictError);
    await expect(svc.create('t1', { name: 'default' })).rejects.toBeInstanceOf(ConflictError);
    // A different tenant may reuse the name.
    await expect(svc.create('t2', { name: 'Alpha' })).resolves.toBeDefined();
  });

  it('renames a stored project but never the reserved default', async () => {
    const svc = service();
    const created = await svc.create('t1', { name: 'Alpha' });
    const renamed = await svc.rename('t1', created.id, { name: 'Beta' });
    expect(renamed.name).toBe('Beta');
    await expect(svc.rename('t1', DEFAULT_PROJECT_ID, { name: 'X' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(svc.rename('t1', 'unknown', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a stored project but never the reserved default; unknown → 404', async () => {
    const svc = service();
    const created = await svc.create('t1', { name: 'Alpha' });
    await svc.remove('t1', created.id);
    expect(await svc.get('t1', created.id)).toBeUndefined();
    await expect(svc.remove('t1', DEFAULT_PROJECT_ID)).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.remove('t1', 'unknown')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('exists is true for the default and any stored project, false otherwise (selection guard)', async () => {
    const svc = service();
    expect(await svc.exists('t1', DEFAULT_PROJECT_ID)).toBe(true);
    const created = await svc.create('t1', { name: 'Alpha' });
    expect(await svc.exists('t1', created.id)).toBe(true);
    expect(await svc.exists('t1', 'nope')).toBe(false);
    // A project id is not valid in a different tenant (no cross-tenant reference).
    expect(await svc.exists('t2', created.id)).toBe(false);
  });
});
