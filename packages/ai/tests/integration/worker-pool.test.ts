import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { runEmbeddingsConformance } from '../conformance/embeddings.conformance';

/**
 * Live worker-pool tests. Guarded — they spawn a real thread that downloads a model on first run.
 * Enable with `TESSERA_TEST_TRANSFORMERS=1`.
 *
 * The measurement here is the whole justification for F-085, so it lives in the tree rather than a
 * throwaway script: the claim "embedding no longer holds the main thread" must be re-provable, and
 * it keeps BOTH calibration controls, because three earlier attempts produced instruments that could
 * not see a KNOWN block and reported the wrong answer with confidence.
 */
const enabled = process.env.TESSERA_TEST_TRANSFORMERS === '1';

describe.skipIf(!enabled)('worker-pool adapter (live)', () => {
  // It IS an Embeddings provider — same port, same conformance suite the in-process adapter runs.
  runEmbeddingsConformance('worker-pool', async () => {
    const { createWorkerPoolEmbeddings } = await import('../../src/adapters/worker-pool/index');
    return createWorkerPoolEmbeddings({ workers: 1 });
  });

  it('produces the same vectors as the in-process adapter (genuinely swappable)', async () => {
    const { createWorkerPoolEmbeddings } = await import('../../src/adapters/worker-pool/index');
    const { createTransformersEmbeddings } = await import('../../src/adapters/transformers/index');
    const pool = await createWorkerPoolEmbeddings({ workers: 1 });
    const inProcess = await createTransformersEmbeddings();

    const [a, b] = await Promise.all([
      pool.embed('the tessera is placed by hand'),
      inProcess.embed('the tessera is placed by hand'),
    ]);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) expect(a[i]).toBeCloseTo(b[i]!, 5);

    await pool.close?.();
  });

  it('keeps the event loop responsive during a scan — the measured claim of F-085', async () => {
    const { createWorkerPoolEmbeddings } = await import('../../src/adapters/worker-pool/index');
    const { createTransformersEmbeddings } = await import('../../src/adapters/transformers/index');

    const texts = Array.from({ length: 24 }, (_, i) =>
      `function handler${i}(req){ return scan(req); }`.repeat(6),
    );
    const ms = (ns: number) => ns / 1e6;

    async function loopDelayDuring(work: () => Promise<unknown>): Promise<number> {
      const h = monitorEventLoopDelay({ resolution: 5 });
      h.enable();
      await work();
      h.disable();
      return ms(h.mean);
    }

    // CONTROLS, both retained — an instrument that cannot see a deliberate block cannot be trusted.
    const onThread = await loopDelayDuring(async () => {
      for (let i = 0; i < 24; i += 1) {
        const until = performance.now() + 36;
        while (performance.now() < until) Math.sqrt(Math.random());
        await new Promise((r) => setImmediate(r));
      }
    });
    const offloaded = await loopDelayDuring(async () => {
      for (let i = 0; i < 24; i += 1) await new Promise((r) => setTimeout(r, 36));
    });

    // Sanity: the controls must separate, or the measurement means nothing.
    expect(onThread).toBeGreaterThan(offloaded * 1.5);

    const inProcess = await createTransformersEmbeddings();
    await inProcess.embed(texts[0]!); // warm
    const inProcessDelay = await loopDelayDuring(() =>
      (async () => {
        for (const t of texts) await inProcess.embed(t);
      })(),
    );

    const pool = await createWorkerPoolEmbeddings({ workers: 1 });
    await pool.embed(texts[0]!); // warm
    const poolDelay = await loopDelayDuring(() =>
      (async () => {
        for (const t of texts) await pool.embed(t);
      })(),
    );
    await pool.close?.();

    console.log(
      `[F-085] loop delay — offloaded ${offloaded.toFixed(1)}ms | on-thread ${onThread.toFixed(1)}ms | ` +
        `in-process embed ${inProcessDelay.toFixed(1)}ms | POOL embed ${poolDelay.toFixed(1)}ms`,
    );

    /*
     * What is asserted, and what is NOT — honesty first.
     *
     * How much in-process embedding holds the main thread is ENVIRONMENT-DEPENDENT: a standalone
     * `node` run measured ~33ms mean loop delay (reads on-thread), while this vitest harness has
     * measured as low as ~14ms (reads nearly offloaded). onnxruntime-node's intra-op native
     * threadpool is why — how much runs on-thread vs on its threads shifts with core count and load.
     * So "in-process always blocks" is NOT asserted; a real run disproved it, and pretending
     * otherwise would be the exact overconfidence the four-attempt measurement saga warns against.
     *
     * The robust, direction-only claims — true in every run — are:
     */
    // 1. The pool keeps the main thread on the RESPONSIVE side of the two controls.
    expect(poolDelay).toBeLessThan((onThread + offloaded) / 2);
    // 2. The pool is never WORSE for the main thread than in-process (small slack for noise).
    expect(poolDelay).toBeLessThanOrEqual(inProcessDelay + 5);
    // The independent, non-benchmark win — real parallelism across concurrent embeds — is covered by
    // the unit suite's queueing test; a sequential loop like this one cannot show it.
  });
});
