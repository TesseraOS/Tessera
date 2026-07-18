'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiEvent } from '@/lib/api/events';
import { RECENT_ACTIVITY_QUERY_KEY } from '@/lib/api/hooks';

/** Coalescing window for stream-triggered feed refetches — one scan can emit a burst of events. */
const RECENT_INVALIDATE_DEBOUNCE_MS = 500;

/**
 * The app-wide bridge from the live event stream to the persisted Recent activity query (F-089).
 *
 * Replaces F-060's `FeedIngest`: the feed and the bell no longer accumulate SSE payloads in a
 * session store — they render the audit trail via `useRecentActivity`, and this component's only
 * job is to tell TanStack Query "the trail moved" when the stream says so. Debounced, so a
 * 300-file scan triggers one refetch, not 300 (the same shape as `useStats`).
 *
 * Mounted exactly once, in `app/providers.tsx` inside `EventsProvider` — the events arrive while
 * the user is on any route, and the bell that renders the result is on every route. Renders
 * nothing.
 *
 * Only events whose *audited cause* is new matter: `memory.captured` (a `memory.write` row) and
 * the scan lifecycle (`source.scan.started` follows the audited scan request; `completed` also
 * freshens the feed after a long scan). Per-document ingest events carry no trail row of their own
 * and are deliberately not subscribed — they were the burst the debounce existed for.
 */
export function ActivitySync(): null {
  const queryClient = useQueryClient();
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const invalidate = () => {
    if (pending.current !== undefined) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_QUERY_KEY });
    }, RECENT_INVALIDATE_DEBOUNCE_MS);
  };

  useApiEvent('memory.captured', invalidate);
  useApiEvent('source.scan.started', invalidate);
  useApiEvent('source.scan.completed', invalidate);

  useEffect(() => () => clearTimeout(pending.current), []);

  return null;
}
