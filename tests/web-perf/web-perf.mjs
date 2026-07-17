// Frontend performance budgets (F-049; ADR-0021, NFR-17).
//
// ADR-0021 asked for a bundle budget in F-028 and it was never turned on — it has been documentation
// ever since. This makes it fail.
//
// What it measures: **first-load JS**, per app, over the wire and gzipped HERE (zlib) rather than read
// from the build output — Next 16/Turbopack no longer prints first-load JS in its route table, and a
// server's compression settings must not be able to change what we claim.
//
// What it does NOT measure, and why: **Core Web Vitals**. Lighthouse was implemented here and then
// removed, because on these pages it cannot produce a number worth gating on. The marketing hero runs a
// WebGL shader and a canvas constellation on continuous rAF loops, so the trace is wall-to-wall long
// tasks: with the default simulated throttling Lighthouse extrapolated a **71,670 ms TBT inside a ~10 s
// trace**, and with `throttlingMethod: 'provided'` it returned **TBT NaN, performance score 0**. Gating
// on either would be gating on noise. CWV needs its own investigation (freeze animations for the trace,
// or measure via PerformanceObserver) — that is **F-074**, with the evidence recorded there. NFR-17's
// CWV budgets therefore remain declared-but-unenforced; the bundle budget below is real and enforced.
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
  const report = [];
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
  }

  if (failures.length > 0) {
    console.error('\n✗ web-perf gate FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nCode-split the regression or register a work item. Do NOT raise budgets.json.\n',
    );
    return 1;
  }
  console.log('\n✓ web-perf gate passed — every budget met\n');
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
