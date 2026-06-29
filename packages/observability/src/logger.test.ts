import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

/** Capture pino's JSON output line(s). */
function capture(): {
  destination: { write(msg: string): void };
  records: () => Record<string, unknown>[];
} {
  const lines: string[] = [];
  return {
    destination: { write: (msg: string) => void lines.push(msg) },
    records: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('createLogger', () => {
  it('redacts secrets and raw content, but keeps benign metadata', () => {
    const sink = capture();
    const logger = createLogger({ destination: sink.destination });

    logger.info(
      { password: 'hunter2', token: 'sk-abc', content: 'raw ingested text', user: 'bob' },
      'request',
    );

    const record = sink.records()[0];
    expect(record).toMatchObject({
      password: '[redacted]',
      token: '[redacted]',
      content: '[redacted]',
      user: 'bob',
      msg: 'request',
    });
  });

  it('redacts nested secret-bearing fields (e.g. headers.authorization)', () => {
    const sink = capture();
    const logger = createLogger({ destination: sink.destination });

    logger.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'incoming');

    const req = sink.records()[0]?.req as { headers: { authorization: string } };
    expect(req.headers.authorization).toBe('[redacted]');
  });

  it('honours the configured level', () => {
    const sink = capture();
    const logger = createLogger({ level: 'warn', destination: sink.destination });
    logger.info('suppressed');
    logger.warn('shown');
    expect(sink.records().map((r) => r.msg)).toEqual(['shown']);
  });
});
