import type { SourceScanProgress } from '@/lib/api/events';
import type { ScanStatus, ScanSummary } from '@/lib/api/types';

/**
 * What a source row renders about its scan (F-087). Derived, pure, and unit-tested — because the
 * row has two informants that can disagree:
 *
 * - `progress` — the live SSE truth for this source, present once any `source.scan.*` event has
 *   been seen this session. Authoritative: the stream is how a background scan reports its outcome
 *   (F-081).
 * - `status` — the `GET /v1/sources/:id/scan` snapshot, fetched once and cached. A page loaded
 *   mid-scan holds `state: 'running'` here until something refetches it.
 *
 * The pre-F-087 bug was ORing the two: when the completed event arrived, the stale snapshot's
 * `running` kept the row in its scanning state until a manual refresh. The rule now: **once the
 * stream has spoken for a source, the snapshot no longer decides whether it is running.**
 */
export interface ScanView {
  readonly running: boolean;
  /** Changed paths processed so far (server-counted, F-081). */
  readonly processed: number;
  /** Changed paths this scan will process. `0` = the diff has not finished yet. */
  readonly total: number;
  /** 0–100 while running with a known total; `undefined` = indeterminate (never fabricated). */
  readonly percent?: number;
  /** The last completed scan's counts, when known. */
  readonly summary?: ScanSummary;
  /** ISO time the last scan completed, when known. */
  readonly at?: string;
  readonly hasError: boolean;
  readonly errorText?: string;
}

export function deriveScanView(input: {
  progress?: SourceScanProgress | undefined;
  status?: ScanStatus | undefined;
  /** The POST /scan mutation is in flight — running until the server has at least accepted it. */
  mutationPending: boolean;
}): ScanView {
  const { progress, status, mutationPending } = input;

  // Live truth outranks the snapshot: if the stream has reported on this source, only it (plus an
  // in-flight trigger) decides `running` — a cached `state: 'running'` snapshot must not.
  const running =
    progress !== undefined
      ? progress.running || mutationPending
      : mutationPending || status?.state === 'running';

  const processed = progress?.processed ?? status?.progress?.processed ?? 0;
  const total = progress?.total ?? status?.progress?.total ?? 0;
  const percent =
    running && total > 0
      ? Math.min(100, Math.max(0, Math.round((processed / total) * 100)))
      : undefined;

  const summary = progress?.lastSummary ?? status?.lastScan?.summary;
  const at = progress?.at ?? status?.lastScan?.at;

  // Same precedence for failure: after a live completed event, a stale snapshot error is history.
  const errorText = progress !== undefined ? progress.error : (status?.error ?? undefined);
  const hasError =
    !running &&
    (progress !== undefined
      ? progress.error !== undefined
      : status?.state === 'error' || status?.error !== undefined);

  return {
    running,
    processed,
    total,
    ...(percent !== undefined ? { percent } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(at !== undefined ? { at } : {}),
    hasError,
    ...(errorText !== undefined ? { errorText } : {}),
  };
}
