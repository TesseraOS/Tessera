import { describe, expect, it } from 'vitest';
import { initialScanEventsState, scanEventsReducer, type ScanEventsState } from '@/lib/api/events';

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
