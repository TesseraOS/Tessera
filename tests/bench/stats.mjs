/** Percentile + timing helpers for the benchmark harness (F-049). Pure, so they can be unit-tested. */

/**
 * The `p`th percentile of `samples` (0 < p < 1), nearest-rank: the smallest value at or below which at
 * least p of the samples fall. Nearest-rank (rather than interpolation) is the honest choice for
 * latency — it always reports a value that was actually observed.
 */
export function percentile(samples, p) {
  if (samples.length === 0) throw new Error('percentile of an empty sample set');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/** Time one async call in ms, using the monotonic high-resolution clock. */
export async function timed(fn) {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

/**
 * Run `fn` `warmup + iterations` times, returning only the measured samples. Warmup runs are discarded:
 * the first calls pay JIT, lazy imports, and cold SQLite page cache, which would inflate a p95 into
 * measuring startup instead of steady-state behavior.
 */
export async function sample(fn, { iterations, warmup = 3 }) {
  for (let i = 0; i < warmup; i += 1) await fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const { ms } = await timed(() => fn(i));
    samples.push(ms);
  }
  return samples;
}

/** Round to 2dp — reports are read by humans; sub-0.01ms precision is noise, not signal. */
export const round = (value) => Math.round(value * 100) / 100;
