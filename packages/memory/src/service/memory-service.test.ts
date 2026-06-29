import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@tessera/core';
import type { MemoryLineageId } from '../domain.js';
import { createInMemoryMemoryStore } from '../adapters/in-memory-memory-store.js';
import { createMemoryService } from './memory-service.js';

function service() {
  return createMemoryService(createInMemoryMemoryStore());
}

describe('createMemoryService', () => {
  it('captures a new memory as version 1 with defaults applied', async () => {
    const memory = await service().capture({
      kind: 'decision',
      title: 'Use Fastify',
      body: 'Reasons',
    });

    expect(memory.version).toBe(1);
    expect(memory.supersedes).toBeNull();
    expect(memory.supersededBy).toBeNull();
    expect(memory.scope).toBe('global');
    expect(memory.confidence).toBe(1);
  });

  it('edits by appending a superseding version without mutating the prior one', async () => {
    const subject = service();
    const v1 = await subject.capture({ kind: 'lesson', title: 'Lesson', body: 'first' });

    const v2 = await subject.edit(v1.lineageId, { body: 'second' });

    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe(v1.id);
    expect(v2.body).toBe('second');
    expect(v2.kind).toBe('lesson'); // kind is immutable across a lineage
    expect((await subject.getCurrent(v1.lineageId))?.id).toBe(v2.id);

    const history = await subject.history(v1.lineageId);
    expect(history.map((memory) => memory.version)).toEqual([1, 2]);
    expect(history[0]?.body).toBe('first'); // original content preserved
    expect(history[0]?.supersededBy).toBe(v2.id);
  });

  it('lists current memories filtered by kind', async () => {
    const subject = service();
    await subject.capture({ kind: 'decision', title: 'Decision', body: 'b' });
    const lesson = await subject.capture({ kind: 'lesson', title: 'Lesson', body: 'b' });

    expect((await subject.list({ kind: 'lesson' })).map((memory) => memory.id)).toEqual([
      lesson.id,
    ]);
  });

  it('rejects invalid input with a ValidationError', async () => {
    await expect(
      service().capture({ kind: 'nope', title: '', body: '' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFound when editing an unknown lineage', async () => {
    await expect(
      service().edit('missing-lineage' as MemoryLineageId, { body: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an empty edit patch', async () => {
    const subject = service();
    const v1 = await subject.capture({ kind: 'task', title: 'Task', body: 'b' });

    await expect(subject.edit(v1.lineageId, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
