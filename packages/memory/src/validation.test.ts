import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIDENCE,
  DEFAULT_SCOPE,
  captureMemorySchema,
  editMemorySchema,
} from './validation.js';

describe('captureMemorySchema', () => {
  it('applies scope, confidence, and metadata defaults', () => {
    const parsed = captureMemorySchema.parse({ kind: 'decision', title: 'Title', body: 'Body' });

    expect(parsed.scope).toBe(DEFAULT_SCOPE);
    expect(parsed.confidence).toBe(DEFAULT_CONFIDENCE);
    expect(parsed.metadata).toEqual({});
  });

  it('rejects an unknown kind', () => {
    expect(captureMemorySchema.safeParse({ kind: 'unknown', title: 'T', body: 'B' }).success).toBe(
      false,
    );
  });

  it('rejects an empty title or body', () => {
    expect(captureMemorySchema.safeParse({ kind: 'task', title: '', body: 'B' }).success).toBe(
      false,
    );
    expect(captureMemorySchema.safeParse({ kind: 'task', title: 'T', body: '' }).success).toBe(
      false,
    );
  });

  it('rejects a confidence outside 0..1', () => {
    expect(
      captureMemorySchema.safeParse({ kind: 'task', title: 'T', body: 'B', confidence: 2 }).success,
    ).toBe(false);
  });
});

describe('editMemorySchema', () => {
  it('accepts a single-field patch', () => {
    expect(editMemorySchema.safeParse({ body: 'new body' }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(editMemorySchema.safeParse({}).success).toBe(false);
  });
});
