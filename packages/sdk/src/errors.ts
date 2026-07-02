/** The decoded body of Tessera's error envelope (`{ error: { code, message, details? } }`). */
export interface TesseraErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

/** Thrown by the SDK when the API responds with a non-2xx status. */
export class TesseraApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: TesseraErrorBody) {
    super(body.message);
    this.name = 'TesseraApiError';
    this.status = status;
    this.code = body.code;
    if (body.details !== undefined) this.details = body.details;
  }
}

/** Decode the API's `{ error: { code, message, details? } }` envelope, degrading gracefully. */
export function parseErrorEnvelope(body: unknown): TesseraErrorBody {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;
      const code = typeof record['code'] === 'string' ? record['code'] : 'UNKNOWN';
      const message = typeof record['message'] === 'string' ? record['message'] : 'request failed';
      return { code, message, details: record['details'] };
    }
  }
  return { code: 'UNKNOWN', message: 'request failed' };
}
