import { describe, expect, it, vi } from 'vitest';

/** Mock the generated SDK so we can assert the thin adapter's behavior (delegation + query shaping). */
const sdkClient = {
  search: vi.fn(),
  queryGraph: vi.fn(),
  me: vi.fn(),
};

vi.mock('@tessera/sdk', () => ({
  createTesseraClient: () => sdkClient,
  TesseraApiError: class TesseraApiError extends Error {
    readonly code: string;
    constructor(
      readonly status: number,
      body: { code: string; message: string },
    ) {
      super(body.message);
      this.name = 'TesseraApiError';
      this.code = body.code;
    }
  },
}));

// Imported after the mock so the module's `createTesseraClient` call resolves to the stub.
const { api, API_ORIGIN, TesseraApiError } = await import('@/lib/api/client');

describe('api client (SDK over the same-origin proxy)', () => {
  it('talks to the same-origin proxy, not the API directly', () => {
    expect(API_ORIGIN).toBe('/api/tessera');
  });

  it('delegates a call to the generated SDK and returns its result', async () => {
    sdkClient.search.mockResolvedValueOnce({ results: [] });
    await expect(api.search({ query: 'x' })).resolves.toEqual({ results: [] });
    expect(sdkClient.search).toHaveBeenCalledWith({ query: 'x' });
  });

  it('sends graph node/edge kinds comma-joined (the API query shape)', async () => {
    sdkClient.queryGraph.mockResolvedValueOnce({ nodes: [], edges: [] });
    await api.queryGraph({ nodeKinds: ['file', 'symbol'], edgeKinds: ['imports'], limit: 10 });
    expect(sdkClient.queryGraph).toHaveBeenCalledWith({
      limit: 10,
      nodeKinds: 'file,symbol',
      edgeKinds: 'imports',
    });
  });

  it('omits empty graph filters', async () => {
    sdkClient.queryGraph.mockResolvedValueOnce({ nodes: [], edges: [] });
    await api.queryGraph({});
    expect(sdkClient.queryGraph).toHaveBeenLastCalledWith({});
  });

  it('propagates the SDK TesseraApiError (re-exported for `instanceof`)', async () => {
    sdkClient.search.mockRejectedValueOnce(
      new TesseraApiError(400, { code: 'VALIDATION', message: 'bad input' }),
    );
    const error = await api.search({ query: '' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TesseraApiError);
    expect(error).toMatchObject({ code: 'VALIDATION', status: 400 });
  });
});
