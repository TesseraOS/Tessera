// Frontend performance budgets (F-049; ADR-0021, NFR-17).
//
// ADR-0021 asked for a bundle budget in F-028 and it was never turned on — it has been documentation
// ever since. This makes it fail.
//
// What it measures: **first-load JS**, per app, over the wire and gzipped HERE (zlib) rather than read
// from the build output — Next 16/Turbopack no longer prints first-load JS in its route table, and a
// server's compression settings must not be able to change what we claim.
//
// It also measures **Core Web Vitals** for apps that declare a `vitals` budget (F-074; ADR-0066).
//
// Not with Lighthouse. F-049 implemented Lighthouse here and removed it: on a page whose hero runs a
// WebGL shader and a canvas constellation on continuous rAF, simulated throttling extrapolated a
// **71,670 ms TBT inside a ~10 s trace**, and `throttlingMethod: 'provided'` returned **TBT NaN,
// performance score 0**. F-074 reproduced the underlying cause **without** Lighthouse, which is what
// settled the design: with animation running, TBT doubles when the measurement window doubles
// (2951 ms at 5 s → 6833 ms at 10 s). It is not a property of the page — it is a function of how long
// you watch. No throttling model is going to fix that.
//
// Under `prefers-reduced-motion: reduce` the same page's TBT is **bounded and window-independent**
// (655–713 ms at both 5 s and 10 s), because the art components paint one frozen frame and stop. So
// that is the condition CWV is measured in — a state the site genuinely ships, not a test-only mode.
//
// The honest limitation, stated here rather than buried: **this does not measure what a
// motion-enabled visitor experiences.** A pathologically expensive shader would not be caught. What
// it does catch is every regression a budget is actually for — bundle growth, blocking scripts,
// layout instability — and it is the only condition in which a task-based metric terminates at all.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));

const KB = 1024;
const STARTUP_TIMEOUT_MS = 120_000;
const SHUTDOWN_GRACE_MS = 5_000;

/**
 * CPU throttling for the vitals pass (F-074; ADR-0066).
 *
 * 4x is Lighthouse's mobile convention, and it is how a 200 ms TBT / 2000 ms LCP budget is normally
 * read — the declared budgets name no device, so this gate names one. Applied through CDP
 * (`Emulation.setCPUThrottlingRate`), i.e. **devtools** throttling: the browser really does run
 * slower. That is the difference from Lighthouse's `simulate`, which models a slower machine from a
 * fast trace and is what produced a 71,670 ms TBT here.
 *
 * Unthrottled was rejected for the reason F-049 rejected it: a localhost LCP of 136 ms represents
 * nothing, and it would flatter the very number the budget exists to constrain.
 */
const CPU_THROTTLE_RATE = 4;

/**
 * How long to watch after `load` before reading the metrics.
 *
 * 10 s, from measurement rather than taste: at 5 s the reduced-motion TBT spread across runs was
 * 345 ms, at 10 s it was 58 ms — a short window sometimes clips a late task, which shows up as
 * flakiness that looks like the app moving. LCP can also still be revised upward late.
 */
const VITALS_SETTLE_MS = 10_000;

/**
 * Passes per app, reported as the **median**.
 *
 * A single lab run is noise; asserting on a max makes the slowest scheduling accident the verdict.
 * The min–max is printed alongside so drift is visible rather than assumed — acceptance clause 3
 * asks for stability *demonstrated*, and a number you cannot see the spread of is not demonstrated.
 */
const VITALS_RUNS = 3;

/**
 * Metrics measured and reported but NOT failed on, with the work item that owns the miss.
 *
 * `budgets.json`'s rule is that a miss is a code-splitting job or a **registered work item**, never
 * a raised number — so the budget below stays at its declared value and the gate says plainly that
 * the app is over it.
 *
 * Marketing measures **~950–1050 ms** against a 200 ms budget as this gate runs it (an isolated
 * probe on a quiet machine showed ~680 ms — this gate shares a browser and a machine with the bundle
 * pass, so its figure is the conservative one, which is the right way round for a budget). The cause
 * is one ~263 ms long task at hydration, present even unthrottled. Deferring it is marketing app
 * work on a design surface, tracked as F-100.
 *
 * Emptying this map is how TBT becomes enforced; that is the whole of F-100's acceptance.
 */
const REPORTED_NOT_ENFORCED = { tbtMs: 'F-100' };

/**
 * Installed before any page script runs, so `buffered: true` cannot miss an early entry.
 *
 * Reads the browser's own entries — no model, no extrapolation. Kept as a string because it is
 * evaluated in the page, not here.
 */
const VITALS_COLLECTOR = `
window.__vitals = { lcp: 0, fcp: 0, shifts: [], longTasks: [] };
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime;
}).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // A shift the user caused by interacting is explicitly not counted by the metric.
    if (!entry.hadRecentInput) window.__vitals.shifts.push({ value: entry.value, at: entry.startTime });
  }
}).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    window.__vitals.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }
}).observe({ type: 'longtask', buffered: true });
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint') window.__vitals.fcp = entry.startTime;
  }
}).observe({ type: 'paint', buffered: true });
`;

/**
 * The gate could not be RUN (not built, port taken, config drift) — as opposed to the budget being
 * missed, or the harness having a real bug. These carry an actionable message and no useful stack,
 * so they are reported as guidance; anything else keeps its stack, because it is a defect.
 */
class GateSetupError extends Error {}

// Every server we own. A gate that leaks a server poisons the NEXT run (a stale build answers on the
// port), so teardown is registered process-wide rather than trusted to a finally block.
const running = new Set();

/** Kill a whole process TREE. Must stay synchronous — `process.on('exit')` cannot await. */
function killTree(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      // Windows has no signalable process group; taskkill /T is how a tree is killed.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // `detached: true` gave the child its own group; the negative pid signals the whole group.
      process.kill(-child.pid, signal);
    }
  } catch {
    // Already gone, or the group vanished between the check and the signal — either way, done.
  }
}

function killAllSync() {
  for (const child of running) killTree(child, 'SIGKILL');
  running.clear();
}
process.on('exit', killAllSync);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    killAllSync();
    process.exit(130);
  });
}

/** budgets.json names a package AND a directory; a rename must not silently measure the wrong app. */
function resolveAppDir(app) {
  const dir = join(repoRoot, app.dir);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) throw new GateSetupError(`${app.name}: no package.json at ${app.dir}`);
  const declared = JSON.parse(readFileSync(manifest, 'utf8')).name;
  if (declared !== app.packageName) {
    throw new GateSetupError(
      `${app.name}: budgets.json says ${app.dir} is ${app.packageName}, but that directory is ${declared} — they have drifted`,
    );
  }
  return dir;
}

/** A busy port means someone else's server would be measured — the budget would be a fiction. */
async function assertPortFree(app) {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', (error) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new GateSetupError(
              `${app.name}: port ${app.port} is already in use — a stale server would be measured instead of this build. Stop it and re-run.`,
            )
          : error,
      ),
    );
    probe.once('listening', () => probe.close(() => resolvePort()));
    probe.listen(app.port, '127.0.0.1');
  });
}

/**
 * Start an app and resolve once it answers. Returns a stop() that always kills it.
 *
 * The app is ONE process we own — `node <next-bin> start --port N`, no shell, no `pnpm --filter`.
 * Those wrappers are what broke this gate: they put cmd.exe (Windows) or pnpm (POSIX) between us and
 * the server, and `child.kill()` only ever reaches the DIRECT child. The real server survived as an
 * orphan holding the write end of our stdio pipes, so the event loop never drained: this script
 * printed its verdict and then hung forever, taking `turbo run test:perf` with it. Killing a tree
 * below is belt-and-braces, since `next start` is free to fork workers.
 */
async function startApp(app) {
  const dir = resolveAppDir(app);
  if (!existsSync(join(dir, '.next', 'BUILD_ID'))) {
    throw new GateSetupError(
      `${app.name}: ${app.dir}/.next is not a production build — run \`pnpm build\` first (CI's build gate runs before this one).`,
    );
  }
  await assertPortFree(app);

  const nextBin = createRequire(join(dir, 'package.json')).resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'start', '--port', String(app.port)], {
    cwd: dir,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  running.add(child);

  // The pipes MUST be drained: an unread pipe fills its buffer and wedges the server it belongs to.
  // Keeping the tail also means a boot failure reports what the app actually said.
  const output = [];
  const capture = (chunk) => {
    output.push(chunk.toString());
    if (output.length > 100) output.shift();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  let exit;
  child.once('exit', (code, signal) => {
    exit = { code, signal };
    running.delete(child);
  });

  const url = `http://127.0.0.1:${app.port}`;
  const stop = async () => {
    if (exit) return;
    killTree(child, 'SIGTERM');
    // Escalate rather than wait forever: a gate must fail fast, never hang.
    const escalate = setTimeout(() => killTree(child, 'SIGKILL'), SHUTDOWN_GRACE_MS);
    escalate.unref();
    await Promise.race([
      new Promise((done) => child.once('exit', done)),
      delay(SHUTDOWN_GRACE_MS * 2),
    ]);
    clearTimeout(escalate);
    running.delete(child);
    child.stdout.destroy();
    child.stderr.destroy();
  };

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // A dead server will never answer — say so now instead of burning the whole timeout in silence.
    if (exit) {
      throw new GateSetupError(
        `${app.name}: server exited (code ${exit.code}, signal ${exit.signal}) before answering on ${url}\n${output.join('')}`,
      );
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return { url, stop };
    } catch {
      // not up yet
    }
    await delay(1000);
  }
  await stop();
  throw new GateSetupError(
    `${app.name}: server never answered on ${url} within ${STARTUP_TIMEOUT_MS / 1000}s\n${output.join('')}`,
  );
}

/**
 * Sum every script the page loads, gzipped. `response.body()` gives the decoded bytes, so gzipping them
 * here yields one consistent number regardless of how the server chose to encode them.
 */
async function measureFirstLoadJs(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect the responses SYNCHRONOUSLY and read their bodies only after the load settles. Reading
  // bodies inside the async handler races the context teardown: the pending body() promises reject,
  // a catch swallows them, and the total silently undercounts — this measured 46KB instead of 214KB,
  // i.e. a budget gate that would happily pass a bundle that had already blown its budget.
  const responses = [];
  const collect = (response) => {
    if (response.request().resourceType() === 'script') responses.push(response);
  };
  page.on('response', collect);
  // `load`, NOT `networkidle` — and this is the whole definition of the budget. "First Load JS" is the
  // JS needed to render the route; chunks pulled in by dynamic import AFTER hydration are explicitly
  // not part of it (that is what code-splitting is FOR). Waiting for networkidle counts the lazy
  // shader chunk and reports ~260KB against a 240KB budget, i.e. it fails the app for successfully
  // deferring work. Detach immediately so post-load lazy chunks cannot leak into the number.
  await page.goto(url, { waitUntil: 'load' });
  page.off('response', collect);

  let bytes = 0;
  const seen = new Set();
  for (const response of responses) {
    if (seen.has(response.url())) continue;
    seen.add(response.url());
    try {
      bytes += gzipSync(await response.body()).byteLength;
    } catch {
      // A body can genuinely be unavailable (redirect/abort); it carries no JS weight either way.
    }
  }
  await context.close();
  if (bytes === 0)
    throw new Error(`measured 0 bytes of JS at ${url} — the harness is broken, not the app`);
  return bytes / KB;
}

/**
 * Cumulative Layout Shift — the **real** metric: the largest sum over a session window, where a
 * window ends after a 1 s gap or 5 s total.
 *
 * Not a naive sum of every shift. Over a 10 s observation a naive sum keeps climbing and would
 * penalise a page for being watched longer, which is the exact failure mode that makes TBT
 * ungateable with animation running — reproducing it in CLS would be an unforced error.
 */
function computeCls(shifts) {
  let largest = 0;
  let windowSum = 0;
  let windowStart = 0;
  let previous = 0;
  for (const shift of shifts) {
    if (windowSum > 0 && (shift.at - previous > 1000 || shift.at - windowStart > 5000)) {
      largest = Math.max(largest, windowSum);
      windowSum = 0;
    }
    if (windowSum === 0) windowStart = shift.at;
    previous = shift.at;
    windowSum += shift.value;
  }
  return Math.max(largest, windowSum);
}

/**
 * Total Blocking Time: for every long task between FCP and the end of the window, the part beyond
 * 50 ms. Tasks straddling either edge are clipped rather than dropped, so the number does not depend
 * on where a task happened to land.
 *
 * **TBT is INP's LAB PROXY, not INP.** INP is a field metric — it needs a real interaction from a
 * real person, and no lab tool can produce it. The report says `TBT` for that reason, and the budget
 * it is compared against is `inpMs` mapped across in `budgets.json`, which says so too.
 */
function computeTbt(longTasks, fcp, windowEndMs) {
  let total = 0;
  for (const task of longTasks) {
    const end = task.start + task.duration;
    if (end <= fcp) continue;
    const start = Math.max(task.start, fcp);
    if (start >= windowEndMs) continue;
    const blocking = Math.min(end, windowEndMs) - start - 50;
    if (blocking > 0) total += blocking;
  }
  return total;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * One vitals pass: load the page under reduced motion + CPU throttling, watch, read the browser's
 * own entries.
 *
 * `reducedMotion: 'reduce'` is set on the CONTEXT, so it is in force for the very first paint — a
 * media query flipped after navigation would leave the art already initialised and measure a state
 * no user is ever in.
 */
async function measureVitalsOnce(browser, url) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
  await page.addInitScript(VITALS_COLLECTOR);

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await delay(VITALS_SETTLE_MS);
  const raw = await page.evaluate(() => window.__vitals);
  const windowEndMs = Date.now() - startedAt;

  await cdp.detach();
  await context.close();

  if (raw.lcp === 0) {
    throw new Error(`no LCP entry at ${url} — the harness is broken, not the app`);
  }
  return {
    lcpMs: raw.lcp,
    cls: computeCls(raw.shifts),
    tbtMs: computeTbt(raw.longTasks, raw.fcp, windowEndMs),
  };
}

/** {@link VITALS_RUNS} passes, reduced to a median plus the observed spread per metric. */
async function measureVitals(browser, url) {
  const runs = [];
  for (let index = 0; index < VITALS_RUNS; index += 1) {
    runs.push(await measureVitalsOnce(browser, url));
  }
  const summarize = (key, round) => {
    const values = runs.map((run) => run[key]);
    return {
      value: round(median(values)),
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
    };
  };
  const ms = (value) => Math.round(value);
  const ratio = (value) => Math.round(value * 1000) / 1000;
  return {
    lcpMs: summarize('lcpMs', ms),
    cls: summarize('cls', ratio),
    tbtMs: summarize('tbtMs', ms),
  };
}

/**
 * Verify the metric math against known inputs, every run, before measuring anything.
 *
 * These two functions are the gate's only real logic, and the pages they run against cannot
 * exercise them: this site's CLS is a genuine, stable **0**, so a `computeCls` that always returned
 * 0 — or summed naively, or ignored session windows — would report "ok" forever and nobody would
 * know. A budget assertion nothing can drive red is not an assertion.
 *
 * Cheap enough to run unconditionally (microseconds), and a failure here is reported as a harness
 * defect rather than a budget miss, because that is what it is.
 */
function assertMetricMath() {
  const near = computeCls([
    { at: 0, value: 0.1 },
    { at: 500, value: 0.2 },
  ]);
  if (Math.abs(near - 0.3) > 1e-9) throw new Error(`computeCls: shifts 500ms apart must sum: ${near}`); // prettier-ignore

  // A gap over 1s starts a new session window; the metric is the LARGEST window, not the total —
  // this is precisely what stops a longer observation inflating the score.
  const gapped = computeCls([
    { at: 0, value: 0.1 },
    { at: 2000, value: 0.2 },
    { at: 2500, value: 0.05 },
  ]);
  if (Math.abs(gapped - 0.25) > 1e-9) throw new Error(`computeCls: 1s gap must split windows: ${gapped}`); // prettier-ignore

  // …and a window is capped at 5s even with NO gap, with the cap measured from where the CURRENT
  // window started rather than from time zero.
  //
  // This input took three attempts to get right, which is the point of writing it down. Every shift
  // is 900ms after the last, so the 1s-gap rule never fires and only the cap can split. A tiny first
  // window is followed by a large second one, so a cap anchored at time zero — the natural bug —
  // splits the second window into single shifts and reports 0.1 where the metric says 0.6. Earlier
  // versions used a 5.5s gap (which the gap rule handled, never reaching the cap) and then a single
  // split at the last element (where the anchor is never re-read): both stayed green with the cap
  // deleted, i.e. they asserted this case's name while proving something else.
  const capped = computeCls([
    ...Array.from({ length: 6 }, (_, index) => ({ at: index * 900, value: 0.01 })),
    ...Array.from({ length: 6 }, (_, index) => ({ at: 5400 + index * 900, value: 0.1 })),
  ]);
  if (Math.abs(capped - 0.6) > 1e-9) throw new Error(`computeCls: 5s window cap: ${capped}`);

  // A user-caused shift never reaches here (filtered at the observer by hadRecentInput), so the
  // only thing left to prove is the arithmetic above.

  const short = computeTbt([{ start: 100, duration: 40 }], 0, 10_000);
  if (short !== 0) throw new Error(`computeTbt: a task under 50ms blocks nothing: ${short}`);

  const blocking = computeTbt([{ start: 100, duration: 200 }], 0, 10_000);
  if (blocking !== 150) throw new Error(`computeTbt: 200ms task blocks 150ms: ${blocking}`);

  const beforeFcp = computeTbt([{ start: 0, duration: 200 }], 500, 10_000);
  if (beforeFcp !== 0) throw new Error(`computeTbt: tasks before FCP are excluded: ${beforeFcp}`);

  // Straddling either edge must CLIP, not drop: dropping makes the number depend on where a task
  // happened to land relative to the window, which is exactly the instability being designed out.
  const straddlesFcp = computeTbt([{ start: 0, duration: 300 }], 100, 10_000);
  if (straddlesFcp !== 150) throw new Error(`computeTbt: clip at FCP: ${straddlesFcp}`);

  const straddlesEnd = computeTbt([{ start: 9900, duration: 300 }], 0, 10_000);
  if (straddlesEnd !== 50) throw new Error(`computeTbt: clip at window end: ${straddlesEnd}`);
}

/** The manifest is the source of truth for the marketing budget; drift between them is a failure. */
function assertManifestAgreement(app, failures) {
  if (app.name !== 'marketing') return;
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, 'docs/design/marketing-design.manifest.json'), 'utf8'),
  );
  const declared = manifest.budgets?.firstLoadJsGzipKb;
  if (declared !== app.firstLoadJsGzipKb) {
    failures.push(
      `marketing: budgets.json says ${app.firstLoadJsGzipKb}KB but marketing-design.manifest.json says ${declared}KB — the manifest is the source of truth; they must not drift`,
    );
  }
}

async function main() {
  const failures = [];
  /** Over-budget metrics that are REGISTERED work items — printed loudly, but not a red build. */
  const notes = [];
  const report = [];
  assertMetricMath();
  const browser = await chromium.launch();

  try {
    for (const app of budgets.apps) {
      assertManifestAgreement(app, failures);
      const { url, stop } = await startApp(app);
      try {
        const firstLoadKb =
          Math.round((await measureFirstLoadJs(browser, `${url}${app.path}`)) * 10) / 10;
        const entry = { app: app.name, path: app.path, firstLoadJsGzipKb: firstLoadKb };
        if (firstLoadKb > app.firstLoadJsGzipKb) {
          failures.push(
            `${app.name} ${app.path}: first-load JS ${firstLoadKb}KB gz > ${app.firstLoadJsGzipKb}KB budget`,
          );
        }

        // Vitals only for apps that declare a budget for them: measuring what nothing asserts costs
        // ~35s per app and produces a number nobody reads.
        if (app.vitals !== undefined) {
          entry.vitals = await measureVitals(browser, `${url}${app.path}`);
          for (const [metric, budget] of Object.entries(app.vitals)) {
            if (metric.startsWith('$')) continue;
            const measured = entry.vitals[metric];
            if (measured === undefined || measured.value <= budget) continue;
            const over = `${app.name} ${app.path}: ${metric} ${measured.value} > ${budget} budget (reduced motion, ${CPU_THROTTLE_RATE}x CPU)`;
            // A registered miss is reported, not failed — see REPORTED_NOT_ENFORCED. Anything else
            // over budget is a real regression and fails the gate.
            const owner = REPORTED_NOT_ENFORCED[metric];
            if (owner === undefined) failures.push(over);
            else notes.push(`${over} — known, tracked as ${owner}`);
          }
        }

        report.push(entry);
      } finally {
        await stop();
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\ntessera web-perf');
  for (const entry of report) {
    const budget = budgets.apps.find((a) => a.name === entry.app);
    console.log(
      `  ${entry.app.padEnd(10)} ${entry.path.padEnd(9)} first-load JS ${entry.firstLoadJsGzipKb} KB gz (budget ${budget.firstLoadJsGzipKb})`,
    );
    if (entry.vitals === undefined) continue;
    // The condition is printed on every line: a vitals number without it is unreadable, and this is
    // the one the reader most needs to weigh (reduced motion is a narrower claim than "it is fast").
    console.log(
      `             ${' '.repeat(9)} vitals (reduced motion, ${CPU_THROTTLE_RATE}x CPU, median of ${VITALS_RUNS})`,
    );
    for (const [metric, budgetValue] of Object.entries(budget.vitals)) {
      if (metric.startsWith('$')) continue;
      const measured = entry.vitals[metric];
      if (measured === undefined) continue;
      const owner = REPORTED_NOT_ENFORCED[metric];
      const status =
        owner !== undefined
          ? `reported only — ${owner}`
          : measured.value <= budgetValue
            ? 'ok'
            : 'OVER';
      const label = metric === 'tbtMs' ? 'tbtMs (INP lab proxy)' : metric;
      console.log(
        `             ${' '.repeat(9)}   ${label.padEnd(22)} ${String(measured.value).padStart(6)} (budget ${budgetValue}, runs ${measured.min}–${measured.max}) ${status}`,
      );
    }
  }

  if (notes.length > 0) {
    console.log('\n  Declared but not enforced (registered work items, not raised budgets):');
    for (const note of notes) console.log(`    - ${note}`);
  }

  if (failures.length > 0) {
    console.error('\n✗ web-perf gate FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nCode-split the regression or register a work item. Do NOT raise budgets.json.\n',
    );
    return 1;
  }
  // Precise, because "every budget met" would be false while a reported-only miss is printed three
  // lines above it — and a summary line that contradicts its own report is how a gate stops being
  // read at all.
  console.log(
    notes.length > 0
      ? `\n✓ web-perf gate passed — every ENFORCED budget met (${notes.length} declared-but-unenforced miss${notes.length === 1 ? '' : 'es'} above)\n`
      : '\n✓ web-perf gate passed — every budget met\n',
  );
  return 0;
}

process.exitCode = await main().catch((error) => {
  if (error instanceof GateSetupError) {
    console.error(`\n✗ web-perf gate could not run:\n  ${error.message}\n`);
  } else {
    console.error('\n✗ web-perf gate crashed — this is a harness defect, not a budget miss:');
    console.error(error);
  }
  return 1;
});
