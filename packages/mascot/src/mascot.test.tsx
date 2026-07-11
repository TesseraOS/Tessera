// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, MIN_SIZE, Mascot } from './mascot.js';
import { CORE_MOODS, MOODS, SURFACE_MOODS, defineMood } from './moods.js';

beforeAll(() => {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
});

/** The tag skeleton of a markup string — structure without attribute values. */
const skeleton = (markup: string): string => markup.replace(/<([a-zA-Z0-9]+)[^>]*>/g, '<$1>');

describe('SSR determinism (the v4.5 hydration rule, held structurally)', () => {
  it('renders byte-identical markup across repeated renders', () => {
    const a = renderToStaticMarkup(<Mascot mood="idle" />);
    const b = renderToStaticMarkup(<Mascot mood="idle" />);
    expect(a).toBe(b);
  });

  it('renders the SAME element skeleton for every mood — only styling varies', () => {
    const reference = skeleton(renderToStaticMarkup(<Mascot mood="idle" />));
    for (const name of [...CORE_MOODS, ...SURFACE_MOODS]) {
      expect(skeleton(renderToStaticMarkup(<Mascot mood={name} />)), name).toBe(reference);
    }
  });

  it('carries mood + face as data and custom properties, never as branched markup', () => {
    const markup = renderToStaticMarkup(<Mascot mood="alarmed" />);
    expect(markup).toContain('data-mood="alarmed"');
    expect(markup).toContain('--tess-tx');
    expect(markup).toContain('--tess-breath-period:3000ms');
    expect(markup).toContain('--tess-eye-open:1.35');
    expect((markup.match(/tess-eye"/g) ?? []).length).toBe(2);
    expect((markup.match(/tess-blush"/g) ?? []).length).toBe(2);
    expect(markup).toContain('tess-gaze');
  });

  it('always renders every mood prop — visibility is CSS, never branched DOM', () => {
    // The idle markup carries the searching graph, work bench, confetti, and loose tile
    // (hidden by CSS): mood switches can never change the DOM shape.
    const markup = renderToStaticMarkup(<Mascot mood="idle" />);
    for (const prop of [
      'tess-prop-kg',
      'tess-prop-work',
      'tess-prop-confetti',
      'tess-prop-loose',
    ]) {
      expect(markup).toContain(prop);
    }
  });
});

describe('accessibility semantics', () => {
  it('is decorative without a title — and reactive adds NO tab stop', () => {
    const markup = renderToStaticMarkup(<Mascot />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-reactive="true"');
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('tabindex');
  });

  it('is a named image with a title', () => {
    const markup = renderToStaticMarkup(<Mascot title="Tess rests" />);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Tess rests"');
    expect(markup).not.toContain('aria-hidden');
  });

  it('is a real labelled button when interactive (svg hidden inside)', () => {
    const markup = renderToStaticMarkup(<Mascot interactive title="Tess, the Tessera mascot" />);
    expect(markup).toMatch(/<button type="button"[^>]*aria-label="Tess, the Tessera mascot"/);
    expect(markup).toContain('aria-hidden="true"');
  });

  it('refuses an interactive Tess without an accessible name', () => {
    expect(() => renderToStaticMarkup(<Mascot interactive />)).toThrow(/requires a title/);
  });

  it('refuses unknown mood names with the full registry in the message', () => {
    expect(() => renderToStaticMarkup(<Mascot mood={'sleeping' as never} />)).toThrow(
      /unknown mood "sleeping"/,
    );
  });
});

describe('sizing', () => {
  it('defaults to 96 and clamps below the legibility floor', () => {
    expect(renderToStaticMarkup(<Mascot />)).toContain(`width="${DEFAULT_SIZE}"`);
    expect(renderToStaticMarkup(<Mascot size={10} />)).toContain(`width="${MIN_SIZE}"`);
    expect(renderToStaticMarkup(<Mascot size={48} />)).toContain('width="48"');
  });
});

describe('custom moods', () => {
  it('renders a defineMood() definition under its own data-mood', () => {
    const mood = defineMood({
      name: 'docs-waiting',
      description: 'Tess waits patiently beside the docs search.',
      poses: { crown: { rotate: 4 } },
      eyes: { gazeY: 0.5 },
      rhythm: { breathPeriodMs: 4400, breathIntensity: 0.4, driftAmp: 1 },
    });
    const markup = renderToStaticMarkup(<Mascot mood={mood} />);
    expect(markup).toContain('data-mood="docs-waiting"');
    expect(skeleton(markup)).toBe(skeleton(renderToStaticMarkup(<Mascot mood="idle" />)));
  });
});

describe('reactions (ADR-0046 v2)', () => {
  let container: HTMLDivElement;
  afterEach(() => {
    container.remove();
  });

  it('a click on a decorative reactive Tess plays the delight one-shot, then settles', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Mascot mood="greeting" />);
    });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('data-react')).toBeNull();

    await act(async () => {
      svg?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(svg?.getAttribute('data-react')).toBe('delight');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });
    expect(svg?.getAttribute('data-react')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  }, 10000);

  it('an interactive Tess plays delight and calls onActivate on click', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let activated = 0;
    await act(async () => {
      root.render(
        <Mascot
          interactive
          title="Tess, the Tessera mascot"
          onActivate={() => {
            activated += 1;
          }}
        />,
      );
    });
    const button = container.querySelector('button');
    const svg = container.querySelector('svg');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(activated).toBe(1);
    expect(svg?.getAttribute('data-react')).toBe('delight');

    await act(async () => {
      root.unmount();
    });
  });

  it('exposes every mood description for consumer sr-text', () => {
    // Consumers pair the figure with text — the registry guarantees the words exist.
    for (const name of [...CORE_MOODS, ...SURFACE_MOODS]) {
      expect(MOODS[name].description.length).toBeGreaterThan(0);
    }
  });
});
