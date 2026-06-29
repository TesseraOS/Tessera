import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@tessera/core';
import { createInMemoryGraphStore } from '../adapters/in-memory-graph-store.js';
import { createKnowledgeGraphService } from './knowledge-graph-service.js';

function service() {
  return createKnowledgeGraphService(createInMemoryGraphStore());
}

describe('createKnowledgeGraphService', () => {
  it('asserts a manual effect-link and finds the dependent via get_effects', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'symbol', key: 'a', label: 'A' });
    await subject.upsertNode({ kind: 'symbol', key: 'b', label: 'B' });

    const link = await subject.assertEffectLink({
      from: { kind: 'symbol', key: 'a' },
      to: { kind: 'symbol', key: 'b' },
      rationale: 'b must be reviewed when a changes',
    });

    expect(link.kind).toBe('EFFECT_LINK');
    expect(link.origin).toBe('manual');
    const effects = await subject.getEffects({ kind: 'symbol', key: 'a' });
    expect(effects.map((hit) => hit.node.key)).toEqual(['b']);
  });

  it('derives static effect-links from import edges (inverse direction)', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'app.ts', label: 'app' });
    await subject.upsertNode({ kind: 'file', key: 'util.ts', label: 'util' });
    await subject.upsertEdge({
      from: { kind: 'file', key: 'app.ts' },
      to: { kind: 'file', key: 'util.ts' },
      kind: 'imports',
    });

    expect(await subject.deriveStaticEffectLinks()).toBe(1);

    const effects = await subject.getEffects({ kind: 'file', key: 'util.ts' });
    expect(effects.map((hit) => hit.node.key)).toEqual(['app.ts']);
    expect(effects[0]?.score ?? 0).toBeCloseTo(0.9);
  });

  it('throws NotFound for get_effects on an unknown node', async () => {
    await expect(service().getEffects({ kind: 'file', key: 'missing' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects an invalid node with a ValidationError', async () => {
    await expect(
      service().upsertNode({ kind: 'file', key: '', label: 'x' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an effect-link with an empty rationale', async () => {
    const subject = service();
    await subject.upsertNode({ kind: 'file', key: 'a', label: 'a' });
    await subject.upsertNode({ kind: 'file', key: 'b', label: 'b' });

    await expect(
      subject.assertEffectLink({
        from: { kind: 'file', key: 'a' },
        to: { kind: 'file', key: 'b' },
        rationale: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
