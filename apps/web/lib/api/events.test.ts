import { describe, expect, it } from 'vitest';
import {
  backoffDelay,
  initialScanEventsState,
  scanEventsReducer,
  type ScanEventsState,
} from '@/lib/api/events';

const SUMMARY = { added: 3, modified: 1, removed: 0, unchanged: 5 };

/**
 * F-081 rewrote this state. Progress used to be INFERRED — count `document.ingested` and attribute
 * it to "whatever source is running" — which broke with two concurrent scans, under-counted
 * silently (the worker emits nothing for an unchanged-hash document, so a no-op re-scan stalled at
 * 0), and stayed at 0 entirely for a non-default tenant (ADR-0050/F-071). The server now counts per
 * source and says so, so these assert a real fraction rather than a heuristic.
 */
describe('scanEventsReducer', () => {
  const started = (sourceId: string, total: number) =>
    scanEventsReducer(initialScanEventsState, { type: 'source.scan.started', sourceId, total });

  it('takes the total from scan.started, so a bar is determinate from the first frame', () => {
    expect(started('s1', 12).bySource['s1']).toEqual({ running: true, processed: 0, total: 12 });
  });

  it('tracks per-source progress — two concurrent scans do not pollute each other', () => {
    // The case the old document.ingested attribution could not express at all.
    let state: ScanEventsState = started('s1', 4);
    state = scanEventsReducer(state, { type: 'source.scan.started', sourceId: 's2', total: 9 });
    state = scanEventsReducer(state, {
      type: 'source.scan.progress',
      sourceId: 's1',
      processed: 3,
      total: 4,
    });

    expect(state.bySource['s1']).toMatchObject({ processed: 3, total: 4 });
    expect(state.bySource['s2']).toMatchObject({ processed: 0, total: 9 });
  });

  it('lands the bar on total when the scan completes', () => {
    let state = started('s1', 4);
    state = scanEventsReducer(state, {
      type: 'source.scan.progress',
      sourceId: 's1',
      processed: 1,
      total: 4,
    });
    state = scanEventsReducer(state, {
      type: 'source.scan.completed',
      sourceId: 's1',
      summary: SUMMARY,
      at: '2026-07-06T10:00:00.000Z',
    });

    // Completed means completed: the bar must not be left wherever the last frame happened to fall.
    expect(state.bySource['s1']).toEqual({
      running: false,
      processed: 4, // added + modified + removed — `unchanged` is not work
      total: 4,
      lastSummary: SUMMARY,
      at: '2026-07-06T10:00:00.000Z',
    });
  });

  it('records a background failure and stops running', () => {
    // The scan is started by a request that was answered long before it died, so if this state does
    // not carry the error the UI shows a scan that simply never finishes.
    let state = started('s1', 4);
    state = scanEventsReducer(state, {
      type: 'source.scan.failed',
      sourceId: 's1',
      error: 'connector exploded',
    });

    expect(state.bySource['s1']).toMatchObject({ running: false, error: 'connector exploded' });
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
