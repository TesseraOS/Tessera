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
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));

const KB = 1024;

/** Start `next start` for an app and resolve once it answers. Returns a stop() that always kills it. */
async function startApp(app) {
  const child = spawn('pnpm', ['--filter', app.packageName, 'start', '--port', String(app.port)], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });
  const url = `http://127.0.0.1:${app.port}`;
  const stop = () => {
    child.kill('SIGTERM');
  };
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return { url, stop };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  throw new Error(`${app.name}: server never answered on ${url} — has the app been built?`);
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
        stop();
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

process.exitCode = await main();
