// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { Logo, LogoIcon } from './logo.js';

/**
 * The mark is brand-critical and shared by both apps, so these pin what BRAND.md §4 actually
 * states — not the styling of any one surface.
 *
 * Rendered with `renderToStaticMarkup` + jsdom parsing, matching `@tessera/mascot`'s convention
 * (no testing-library in these packages). The logo is a pure static SVG, so static markup is the
 * whole truth about it.
 */
function parse(element: ReactElement): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe('LogoIcon', () => {
  it('renders mark v2: the 3x3 mosaic plus the lifted ember tile', () => {
    const host = parse(<LogoIcon />);

    // The master's canvas. v1 shipped a 32-viewBox pixel mark — a different logo entirely.
    expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 112 112');
    // 8 seated tiles + the empty seat + the gilded tile arriving into it.
    expect(host.querySelectorAll('rect')).toHaveLength(10);
  });

  it('rides currentColor, so the mosaic is theme-true without configuration', () => {
    expect(
      parse(<LogoIcon />)
        .querySelector('g')
        ?.getAttribute('fill'),
    ).toBe('currentColor');
  });

  it('falls back to a MONOCHROME ember rather than an invisible tile when unbound', () => {
    // The safety property this package is built around. The dashboard runs 4 themes x 2 modes; an
    // ember resolving to `transparent` in some of them would be worse than the v1 it replaces.
    // BRAND.md §4 sanctions the monochrome fallback explicitly, so currentColor is on-brand.
    const stops = parse(<LogoIcon />).querySelectorAll('stop');

    expect(stops).toHaveLength(2);
    expect(stops[0]?.getAttribute('stop-color')).toBe('var(--brand-ember-from, currentColor)');
    expect(stops[1]?.getAttribute('stop-color')).toBe('var(--brand-ember-to, currentColor)');
  });

  it('isolates its gradient id so two marks on one page cannot collide', () => {
    // SVG gradient ids are document-global: sharing one means the second mark silently retargets
    // the first's gradient. Marketing already renders three marks per page (nav, menu, footer).
    const host = parse(
      <>
        <LogoIcon emberId="ember-nav" />
        <LogoIcon emberId="ember-footer" />
      </>,
    );

    const ids = [...host.querySelectorAll('linearGradient')].map((node) => node.id);
    expect(ids).toEqual(['ember-nav', 'ember-footer']);

    const fills = [...host.querySelectorAll('rect[fill^="url"]')].map((node) =>
      node.getAttribute('fill'),
    );
    expect(fills).toEqual(['url(#ember-nav)', 'url(#ember-footer)']);
  });

  it('is decorative — text carries the name', () => {
    expect(
      parse(<LogoIcon />)
        .querySelector('svg')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });
});

describe('Logo lockup', () => {
  // The inner span. Matching on textContent alone would find the OUTER lockup span first — the svg
  // contributes no text, so the wrapper reads as "tessera" too.
  const wordmarkOf = (host: HTMLElement) => host.querySelector<HTMLElement>('span > span');

  it('sets the wordmark lowercase and never bold (BRAND.md §4)', () => {
    const wordmark = wordmarkOf(parse(<Logo />));

    expect(wordmark?.textContent).toBe('tessera'); // never "Tessera"
    expect(wordmark?.className).toContain('font-normal');
    expect(wordmark?.className).not.toContain('font-semibold');
  });

  it('takes its face from the brand contract, with a serif fallback', () => {
    expect(wordmarkOf(parse(<Logo />))?.getAttribute('style')).toContain(
      'var(--brand-wordmark-font, ui-serif, serif)',
    );
  });

  it('lets a caller override a default instead of emitting both classes', () => {
    // Why the package carries tailwind-merge: string concatenation would emit `size-7 size-5` and
    // leave the winner to stylesheet order.
    const host = parse(<Logo iconClassName="size-5" textClassName="text-xl" />);
    const icon = host.querySelector('svg')?.getAttribute('class') ?? '';

    expect(icon).toContain('size-5');
    expect(icon).not.toContain('size-7');
    expect(wordmarkOf(host)?.className).toContain('text-xl');
  });
});
