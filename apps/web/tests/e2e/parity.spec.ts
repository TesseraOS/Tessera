import { expect, test } from './support/fixtures';

/**
 * Theme + viewport parity (F-064; FR-49, NFR-9).
 *
 * The acceptance asked for a screenshot matrix. That was put to the lead and replaced with executable
 * assertions, because F-057 had already rejected screenshots for this job — its reasoning still sits
 * in `analytics.spec.ts`: a screenshot proves a page looked right on the day someone looked at it,
 * whereas an assertion fails the build when it stops being true. Colour contrast across all four
 * themes × light/dark is already asserted by `tests/contrast.test.ts` (195 cases). What was NOT
 * covered, and is covered here, is layout: whether a route overflows its viewport, and whether
 * reduced-motion is honoured.
 *
 * **No API stubs, deliberately.** Every route is visited with the API unreachable, so each renders
 * its error or empty state — and those are exactly the layouts nobody looks at on a phone. A page
 * that fits when full of data and bursts its viewport when showing an error is still a broken page.
 */
const ROUTES = [
  '/',
  '/search',
  '/inspector',
  '/graph',
  '/memory',
  '/timeline',
  '/sources',
  '/analytics',
  '/audit',
  '/governance',
  '/billing',
  '/settings',
  '/profile',
];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test(`no route overflows horizontally at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const overflowing: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      // Settle the shell before measuring; a mid-hydration layout is not the one users see.
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        // 1px of tolerance for sub-pixel rounding at fractional device ratios.
        return el.scrollWidth - el.clientWidth > 1
          ? { by: el.scrollWidth - el.clientWidth, width: el.scrollWidth }
          : null;
      });
      if (overflow !== null) {
        overflowing.push(
          `${route} (+${String(overflow.by)}px, scrollWidth ${String(overflow.width)})`,
        );
      }
    }

    // Reported together rather than failing on the first: one assertion per run tells you the whole
    // shape of a responsive regression instead of making you fix it thirteen times.
    expect(overflowing, `routes overflowing at ${viewport.name}`).toEqual([]);
  });
}

test('reduced motion is honoured — transitions do not run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings');
  await expect(page.getByText('Appearance')).toBeVisible();

  // globals.css collapses durations under `prefers-reduced-motion: reduce`. Asserting the COMPUTED
  // duration is what makes that real: the media query could be present and still not apply to the
  // elements that animate.
  const durations = await page.evaluate(() => {
    /**
     * Parse a computed duration into milliseconds. Chromium reports the reduced-motion override as
     * `1e-05s` — 0.01ms in scientific notation — so a string comparison against "0.01ms" misses it
     * entirely and every element looks like it is still animating. Parse, do not match.
     */
    const toMs = (value: string): number => {
      const seconds = value.trim().endsWith('ms') ? 0.001 : 1;
      return Number.parseFloat(value) * seconds * 1000;
    };
    return (
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el))
        .flatMap((style) => [style.transitionDuration, style.animationDuration])
        .filter((value) => value !== '')
        // Anything a human could perceive. 0.01ms is the conventional "effectively off" value.
        .filter((value) => toMs(value) > 1)
    );
  });

  expect(durations).toEqual([]);
});
