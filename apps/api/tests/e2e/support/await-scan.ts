import type { z } from 'zod/v4';
import type { buildServer } from '../../../src/index';
import type { scanStatusResponseSchema } from '../../../src/schemas/sources';

type App = ReturnType<typeof buildServer>;

/** The wire shape of `GET /v1/sources/:id/scan` — the source's most recent scan status. */
type ScanStatus = z.infer<typeof scanStatusResponseSchema>;

/**
 * Await a background scan to completion over the HTTP surface.
 *
 * F-081 made `POST /v1/sources/:id/scan` asynchronous: it returns **202** and the scan runs in the
 * background, so a caller cannot read a scan's effects (documents, `lastScan`) from the POST — it
 * must observe completion through `GET /v1/sources/:id/scan`. This polls that real status endpoint
 * until the scan leaves `running` (→ `idle`/`error`) and returns the terminal status, so a test
 * awaits the **actual completion signal** rather than padding a fixed delay.
 *
 * The loop is bounded only as a safety net: a genuinely stuck scan fails the test loudly instead of
 * hanging the suite. Under normal operation the in-process queue drains within a tick or two, well
 * inside this ceiling.
 */
export async function awaitScan(
  app: App,
  sourceId: string,
  headers?: Record<string, string>,
): Promise<ScanStatus> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sources/${sourceId}/scan`,
      ...(headers !== undefined ? { headers } : {}),
    });
    if (res.statusCode !== 200) {
      throw new Error(`scan status query failed: ${res.statusCode} ${res.body}`);
    }
    const status = res.json() as ScanStatus;
    if (status.state !== 'running') return status;
    // Yield past the microtask queue (where the in-process queue delivers) so the background scan
    // makes progress between polls.
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`scan of ${sourceId} did not complete within the poll budget`);
}
