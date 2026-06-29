import { describe, expect, it } from 'vitest';
import { effectsQuerySchema } from './effects.js';
import { captureBodySchema, editBodySchema, memorySchema } from './memory.js';
import { searchBodySchema } from './search.js';

describe('boundary schemas', () => {
  it('search body requires a non-empty query and bounds the limit', () => {
    expect(searchBodySchema.safeParse({ query: 'hi' }).success).toBe(true);
    expect(searchBodySchema.safeParse({ query: '' }).success).toBe(false);
    expect(searchBodySchema.safeParse({ query: 'hi', limit: 0 }).success).toBe(false);
    expect(searchBodySchema.safeParse({ query: 'hi', limit: 1000 }).success).toBe(false);
  });

  it('effects query coerces maxDepth from its string querystring form', () => {
    const parsed = effectsQuerySchema.parse({ kind: 'file', key: 'a.ts', maxDepth: '3' });
    expect(parsed.maxDepth).toBe(3);
    expect(effectsQuerySchema.safeParse({ kind: 'nope', key: 'a.ts' }).success).toBe(false);
  });

  it('capture body validates kind/title/body and leaves defaults to the service', () => {
    const ok = captureBodySchema.safeParse({ kind: 'decision', title: 't', body: 'b' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.scope).toBeUndefined();
    expect(captureBodySchema.safeParse({ kind: 'bogus', title: 't', body: 'b' }).success).toBe(
      false,
    );
  });

  it('edit body rejects an empty patch', () => {
    expect(editBodySchema.safeParse({}).success).toBe(false);
    expect(editBodySchema.safeParse({ title: 'new' }).success).toBe(true);
  });

  it('memory response schema accepts a full memory version', () => {
    const parsed = memorySchema.safeParse({
      id: 'm1',
      lineageId: 'l1',
      kind: 'lesson',
      title: 't',
      body: 'b',
      scope: 'global',
      confidence: 1,
      metadata: { tags: ['x'] },
      version: 1,
      supersedes: null,
      supersededBy: null,
      createdAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
});
