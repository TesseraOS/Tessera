import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@tessera/core';
import { describe, expect, it } from 'vitest';
import { mapError } from './error-handler.js';

describe('mapError', () => {
  it('maps each domain error code to its HTTP status', () => {
    expect(mapError(new ValidationError('bad')).statusCode).toBe(400);
    expect(mapError(new UnauthorizedError('no')).statusCode).toBe(401);
    expect(mapError(new ForbiddenError('no')).statusCode).toBe(403);
    expect(mapError(new NotFoundError('gone')).statusCode).toBe(404);
    expect(mapError(new ConflictError('dup')).statusCode).toBe(409);
  });

  it('preserves a client error message + details and is not a server fault', () => {
    const mapped = mapError(new ValidationError('invalid query', { details: { field: 'query' } }));
    expect(mapped.serverFault).toBe(false);
    expect(mapped.body).toEqual({
      error: { code: 'VALIDATION', message: 'invalid query', details: { field: 'query' } },
    });
  });

  it('masks internal errors — generic message, no details, logged as a server fault', () => {
    const mapped = mapError(
      new InternalError('db password=hunter2 failed', { details: { dsn: 'secret' } }),
    );
    expect(mapped.statusCode).toBe(500);
    expect(mapped.serverFault).toBe(true);
    expect(mapped.body).toEqual({ error: { code: 'INTERNAL', message: 'internal server error' } });
  });

  it('masks unknown thrown values as a 500 without leaking detail', () => {
    const mapped = mapError(new Error('stack with /home/secret/path'));
    expect(mapped.statusCode).toBe(500);
    expect(mapped.serverFault).toBe(true);
    expect(mapped.body.error.message).toBe('internal server error');
  });

  it('preserves a framework 4xx (e.g. malformed body) in the envelope', () => {
    const mapped = mapError({ statusCode: 400, message: 'Unexpected end of JSON input' });
    expect(mapped.statusCode).toBe(400);
    expect(mapped.serverFault).toBe(false);
    expect(mapped.body).toEqual({
      error: { code: 'VALIDATION', message: 'Unexpected end of JSON input' },
    });
  });

  it('treats a framework 5xx-shaped error as a masked internal fault', () => {
    const mapped = mapError({ statusCode: 503, message: 'upstream down' });
    expect(mapped.statusCode).toBe(500);
    expect(mapped.serverFault).toBe(true);
    expect(mapped.body.error.code).toBe('INTERNAL');
  });
});
