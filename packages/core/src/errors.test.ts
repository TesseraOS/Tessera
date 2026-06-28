import { describe, expect, it } from 'vitest';
import { NotFoundError, TesseraError, ValidationError } from './errors';

describe('errors', () => {
  it('TesseraError defaults to INTERNAL and sets name from the subclass', () => {
    const error = new TesseraError('boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INTERNAL');
    expect(error.name).toBe('TesseraError');
    expect(error.message).toBe('boom');
  });

  it('ValidationError carries the VALIDATION code and details', () => {
    const error = new ValidationError('bad input', { details: { field: 'email' } });
    expect(error).toBeInstanceOf(TesseraError);
    expect(error.code).toBe('VALIDATION');
    expect(error.name).toBe('ValidationError');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('root cause');
    const error = new NotFoundError('missing', { cause });
    expect(error.code).toBe('NOT_FOUND');
    expect(error.cause).toBe(cause);
  });
});
