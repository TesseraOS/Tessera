import { describe, expect, it } from 'vitest';
import { deriveScanView } from '@/components/sources/scan-state';
import type { SourceScanProgress } from '@/lib/api/events';
import type { ScanStatus } from '@/lib/api/types';

const summary = { added: 3, modified: 1, removed: 0, unchanged: 10 };

describe('deriveScanView', () => {
  it('lets a live completed event end the scanning state despite a stale running snapshot', () => {
    // The F-087 bug: the page was loaded mid-scan, so the cached snapshot still says `running`.
    const status: ScanStatus = { state: 'running', progress: { processed: 1, total: 4 } };
    const progress: SourceScanProgress = {
      running: false,
      processed: 4,
      total: 4,
      lastSummary: summary,
      at: '2026-07-18T10:00:00.000Z',
    };

    const view = deriveScanView({ progress, status, mutationPending: false });

    expect(view.running).toBe(false);
    expect(view.summary).toEqual(summary);
    expect(view.at).toBe('2026-07-18T10:00:00.000Z');
    expect(view.hasError).toBe(false);
  });

  it('trusts the snapshot only while the stream has not spoken', () => {
    const status: ScanStatus = { state: 'running', progress: { processed: 2, total: 8 } };

    const view = deriveScanView({ status, mutationPending: false });

    expect(view.running).toBe(true);
    expect(view.processed).toBe(2);
    expect(view.total).toBe(8);
    expect(view.percent).toBe(25);
  });

  it('is indeterminate (no percent) while the total is unknown', () => {
    const progress: SourceScanProgress = { running: true, processed: 0, total: 0 };

    const view = deriveScanView({ progress, mutationPending: false });

    expect(view.running).toBe(true);
    expect(view.percent).toBeUndefined();
  });

  it('runs while the trigger mutation is still in flight, before any event or snapshot', () => {
    const view = deriveScanView({ mutationPending: true });

    expect(view.running).toBe(true);
    expect(view.percent).toBeUndefined();
  });

  it('reports a live failure over a stale snapshot, with the error text', () => {
    const status: ScanStatus = { state: 'running' };
    const progress: SourceScanProgress = {
      running: false,
      processed: 1,
      total: 4,
      error: 'walker died',
    };

    const view = deriveScanView({ progress, status, mutationPending: false });

    expect(view.running).toBe(false);
    expect(view.hasError).toBe(true);
    expect(view.errorText).toBe('walker died');
  });

  it('surfaces a snapshot error when there is no live state', () => {
    const status: ScanStatus = { state: 'error', error: 'root not found' };

    const view = deriveScanView({ status, mutationPending: false });

    expect(view.hasError).toBe(true);
    expect(view.errorText).toBe('root not found');
  });

  it('a live success clears a stale snapshot error', () => {
    const status: ScanStatus = { state: 'error', error: 'old failure' };
    const progress: SourceScanProgress = {
      running: false,
      processed: 2,
      total: 2,
      lastSummary: summary,
      at: '2026-07-18T11:00:00.000Z',
    };

    const view = deriveScanView({ progress, status, mutationPending: false });

    expect(view.hasError).toBe(false);
    expect(view.errorText).toBeUndefined();
    expect(view.summary).toEqual(summary);
  });

  it('is quiet for an idle, never-scanned source', () => {
    const view = deriveScanView({ status: { state: 'idle' }, mutationPending: false });

    expect(view.running).toBe(false);
    expect(view.hasError).toBe(false);
    expect(view.summary).toBeUndefined();
  });

  it('clamps percent to 100 even if processed overshoots total', () => {
    const progress: SourceScanProgress = { running: true, processed: 9, total: 8 };

    const view = deriveScanView({ progress, mutationPending: false });

    expect(view.percent).toBe(100);
  });
});
