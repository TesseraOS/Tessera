import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, TesseraApiError } from '@/lib/api/client';

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })),
    );
    await expect(api.search({ query: 'x' })).resolves.toEqual({ results: [] });
  });

  it('throws a TesseraApiError carrying the envelope code on a 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'VALIDATION', message: 'bad input' } }), {
            status: 400,
          }),
      ),
    );
    await expect(api.search({ query: '' })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
      message: 'bad input',
    });
  });

  it('throws a NETWORK TesseraApiError when fetch itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    const error = await api.compile({ task: 't', budget: 1 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TesseraApiError);
    expect((error as TesseraApiError).code).toBe('NETWORK');
  });
});
