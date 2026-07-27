import { describe, expect, it } from 'vitest';
import { buildFlatNavLinks, buildNavGroups } from '@/components/app-shared';
import { navItems } from '@/lib/nav';

/**
 * **The two nav sources must agree.**
 *
 * Navigation is defined twice: `components/app-shared.tsx` (`buildNavGroups`/`buildFooterNavLinks`)
 * drives the sidebar, and `lib/nav.ts` (`navItems`) drives the ⌘K command palette. Editing one and
 * not the other ships a page that is reachable from the sidebar but invisible to the palette, or the
 * reverse — a silent, per-feature trap that F-057 hit while adding Analytics.
 *
 * This does not fix the duplication (that is a refactor, and not this feature's job). It makes the
 * duplication **safe**: the moment the two disagree about which routes exist, this fails and names
 * the route. Deliberately compares route sets and titles only — the sidebar carries active-state and
 * React nodes that the palette has no business knowing about.
 */
describe('navigation sources agree', () => {
  const sidebar = buildFlatNavLinks('/');

  it('exposes the same set of routes to the sidebar and the ⌘K palette', () => {
    const fromSidebar = sidebar.map((item) => item.path).filter((path) => path !== undefined);
    const fromPalette = navItems.map((item) => item.href);
    expect([...fromPalette].sort()).toEqual([...fromSidebar].sort());
  });

  it('uses the same title for each route in both', () => {
    const titles = new Map(sidebar.map((item) => [item.path, item.title]));
    for (const item of navItems) {
      expect(titles.get(item.href), `title for ${item.href}`).toBe(item.title);
    }
  });

  it('includes Analytics — the F-057 view, in both sources', () => {
    expect(navItems.some((item) => item.href === '/analytics')).toBe(true);
    expect(sidebar.some((item) => item.path === '/analytics')).toBe(true);
  });

  it('groups every route under a labelled section except the Overview', () => {
    // A route added to a nameless group is reachable but unfiled; the sidebar renders it adrift at
    // the top. Only the Overview is deliberately unlabelled.
    for (const group of buildNavGroups('/')) {
      if (group.label !== undefined) continue;
      expect(group.items.map((item) => item.path)).toEqual(['/']);
    }
  });
});
