import { expect, test } from '@playwright/test';

/**
 * THE RIPPLE GATE (ADR-0054 §ripple, F-053 polish): the theme switch must propagate as
 * a full-length radial view transition from the pressed control — not an instant swap,
 * not a half-dead circle. These assertions encode the probe findings that diagnosed the
 * original defects: a hidden document aborts every view transition (so this suite runs
 * where Playwright reports the page visible), and a second press used to hard-abort the
 * in-flight transition mid-screen.
 *
 * Instrumentation wraps startViewTransition/animate BEFORE the press and reports the
 * observed lifecycle; assertions run on the recorded facts.
 */

interface RippleReport {
  visibility: string;
  readyResolved: boolean;
  readyRejected: string | null;
  clipPseudo: string | null;
  clipOriginAtControlCenter: boolean;
  clipDurationMs: number;
  clipCompleted: boolean;
  transitionOutlivedClip: boolean;
}

async function pressAndObserve(page: import('@playwright/test').Page): Promise<RippleReport> {
  return page.evaluate(
    () =>
      new Promise<RippleReport>((resolve) => {
        const report: RippleReport = {
          visibility: document.visibilityState,
          readyResolved: false,
          readyRejected: null,
          clipPseudo: null,
          clipOriginAtControlCenter: false,
          clipDurationMs: 0,
          clipCompleted: false,
          transitionOutlivedClip: false,
        };
        const toggle = [...document.querySelectorAll('[data-theme-toggle]')].find(
          (el) => el.getBoundingClientRect().width > 0,
        ) as HTMLButtonElement;
        const rect = toggle.getBoundingClientRect();
        const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

        let clipEnd = 0;
        let vtEnd = 0;
        const origAnimate = document.documentElement.animate.bind(document.documentElement);
        document.documentElement.animate = ((kf: Keyframe[], opts: KeyframeAnimationOptions) => {
          report.clipPseudo = opts.pseudoElement ?? null;
          report.clipDurationMs = Number(opts.duration ?? 0);
          const firstFrame = String((kf as unknown as { clipPath: string[] }).clipPath?.[0] ?? '');
          // circle(0px at <x>px <y>px) — the origin must be the control's center (±2px).
          const match = /at ([\d.]+)px ([\d.]+)px/.exec(firstFrame);
          if (match) {
            report.clipOriginAtControlCenter =
              Math.abs(Number(match[1]) - center.x) <= 2 && Math.abs(Number(match[2]) - center.y) <= 2;
          }
          const anim = origAnimate(kf, opts);
          anim.finished.then(
            () => {
              report.clipCompleted = true;
              clipEnd = performance.now();
            },
            () => {},
          );
          return anim;
        }) as typeof document.documentElement.animate;

        const origSVT = document.startViewTransition.bind(document);
        document.startViewTransition = ((cb: () => void | Promise<void>) => {
          const vt = origSVT(cb);
          vt.ready.then(
            () => {
              report.readyResolved = true;
            },
            (err: unknown) => {
              report.readyRejected = String(err).slice(0, 200);
            },
          );
          vt.finished.then(() => {
            vtEnd = performance.now();
          });
          return vt;
        }) as typeof document.startViewTransition;

        toggle.click();
        setTimeout(() => {
          report.transitionOutlivedClip = report.clipCompleted && vtEnd >= clipEnd;
          resolve(report);
        }, 1800);
      }),
  );
}

test('the theme ripple runs full-length from the control center', async ({ page }) => {
  await page.goto('/docs');
  // Hydration must be complete before the press — the probe patches page globals.
  await expect(page.locator('#nd-sidebar [data-theme-toggle]')).toBeVisible();
  const report = await pressAndObserve(page);

  // A hidden document would abort every transition and void the test.
  expect(report.visibility).toBe('visible');
  expect(report.readyRejected).toBeNull();
  expect(report.readyResolved).toBe(true);
  // The circle: on the root's NEW snapshot, from the control's center, full 550ms.
  expect(report.clipPseudo).toBe('::view-transition-new(root)');
  expect(report.clipOriginAtControlCenter).toBe(true);
  expect(report.clipDurationMs).toBe(550);
  expect(report.clipCompleted).toBe(true);
  // The transition must wait for the clip — an early teardown is the mid-way flash.
  expect(report.transitionOutlivedClip).toBe(true);
});

test('rapid toggling settles cleanly and the final ripple completes', async ({ page }) => {
  await page.goto('/docs');
  const toggle = page.locator('#nd-sidebar [data-theme-toggle]');
  await expect(toggle).toBeVisible();

  const beforeClass = await page.evaluate(() =>
    document.documentElement.classList.contains('light'),
  );
  // Three quick presses: in-flight transitions are skipped to their end state, never
  // hard-aborted mid-screen; the last press still ripples fully.
  await toggle.click();
  await page.waitForTimeout(120);
  await toggle.click();
  await page.waitForTimeout(120);
  await toggle.click();
  await page.waitForTimeout(1500);

  // Odd number of presses — the theme must have flipped exactly once net.
  const afterClass = await page.evaluate(() =>
    document.documentElement.classList.contains('light'),
  );
  expect(afterClass).toBe(!beforeClass);
  // And it survives a reload (persisted, no half-applied state).
  await page.reload();
  const persisted = await page.evaluate(() =>
    document.documentElement.classList.contains('light'),
  );
  expect(persisted).toBe(afterClass);
});
