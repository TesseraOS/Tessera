import { describe, expect, it } from 'vitest';
import {
  backoffDelay,
  initialScanEventsState,
  scanEventsReducer,
  type ScanEventsState,
} from '@/lib/api/events';

const SUMMARY = { added: 3, modified: 1, removed: 0, unchanged: 5 };

describe('scanEventsReducer', () => {
  it('marks a source running on scan.started', () => {
    const next = scanEventsReducer(initialScanEventsState, {
      type: 'source.scan.started',
      sourceId: 's1',
    });
    expect(next.bySource['s1']).toEqual({ running: true, ingested: 0 });
  });

  it('counts document.ingested against running sources only', () => {
    let state: ScanEventsState = scanEventsReducer(initialScanEventsState, {
      type: 'source.scan.started',
      sourceId: 's1',
    });
    state = scanEventsReducer(state, { type: 'document.ingested' });
    state = scanEventsReducer(state, { type: 'document.ingested' });
    expect(state.bySource['s1']?.ingested).toBe(2);
  });

  it('ignores document.ingested when nothing is running (no attribution)', () => {
    const next = scanEventsReducer(initialScanEventsState, { type: 'document.ingested' });
    expect(next).toBe(initialScanEventsState);
  });

  it('records the summary and stops running on scan.completed', () => {
    let state = scanEventsReducer(initialScanEventsState, {
      type: 'source.scan.started',
      sourceId: 's1',
    });
    state = scanEventsReducer(state, { type: 'document.ingested' });
    state = scanEventsReducer(state, {
      type: 'source.scan.completed',
      sourceId: 's1',
      summary: SUMMARY,
      at: '2026-07-06T10:00:00.000Z',
    });
    expect(state.bySource['s1']).toEqual({
      running: false,
      ingested: 1,
      lastSummary: SUMMARY,
      at: '2026-07-06T10:00:00.000Z',
    });
  });
});

describe('backoffDelay', () => {
  it('grows exponentially and caps at 30s', () => {
    // The top of each jitter window: base * 2^attempt, capped.
    const highest = (attempt: number) => backoffDelay(attempt, () => 1);
    expect(highest(0)).toBe(1_000);
    expect(highest(1)).toBe(2_000);
    expect(highest(2)).toBe(4_000);
    expect(highest(3)).toBe(8_000);
    // Capped: an API that stays down must not push retries out into the minutes.
    expect(highest(10)).toBe(30_000);
    expect(highest(50)).toBe(30_000);
  });

  it('jitters over the upper half of the window and never retries immediately', () => {
    // Full jitter across [window/2, window]. Without it, every open dashboard would retry in
    // lockstep and hammer a recovering API; a zero delay would be a hot loop.
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(0, () => 0.5)).toBe(750);
    expect(backoffDelay(0, () => 1)).toBe(1_000);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delay = backoffDelay(attempt);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(30_000);
    }
  });
});
