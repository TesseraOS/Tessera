import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAN_IDS, PLANS } from '@tessera/billing';
import { describe, expect, it } from 'vitest';
import { entitlementLines, formatCadence, formatPrice, planDisplays } from '@/lib/pricing';

/**
 * The pricing page's honesty contract (F-051 acceptance, MARKETING-DESIGN §3.8): every
 * number renders FROM the @tessera/billing PLANS catalog. Expectations below are DERIVED
 * from PLANS at test time — change the catalog and these tests follow, hand-copy a number
 * into the page and the source scan fails.
 */
describe('pricing display model derives from PLANS', () => {
  it('projects every plan in stable catalog order', () => {
    const displays = planDisplays();
    expect(displays.map((d) => d.id)).toEqual([...PLAN_IDS]);
    expect(displays.map((d) => d.name)).toEqual(PLAN_IDS.map((id) => PLANS[id].name));
  });

  it('formats positive prices from priceCents, never hand-written', () => {
    for (const id of PLAN_IDS) {
      const plan = PLANS[id];
      if (plan.priceCents > 0) {
        expect(formatPrice(plan)).toBe(`$${plan.priceCents / 100}`);
        expect(formatCadence(plan)).toBe(`per ${plan.interval}`);
      }
    }
  });

  it('renders the free plan as $0 forever and contact-sales tiers as Custom', () => {
    expect(formatPrice(PLANS.free)).toBe('$0');
    expect(formatCadence(PLANS.free)).toBe('forever');
    // Enterprise is priceCents 0 but NOT free (see the catalog comment) — never show $0.
    expect(formatPrice(PLANS.enterprise)).toBe('Custom');
    expect(formatCadence(PLANS.enterprise)).toBe('contact sales');
  });

  it('derives entitlement lines from the catalog values (-1 renders unlimited)', () => {
    for (const id of PLAN_IDS) {
      const entitlements = PLANS[id].entitlements;
      const lines = entitlementLines(entitlements);
      expect(lines).toHaveLength(3);

      const [compiles, seats, budget] = lines;
      if (entitlements.maxMonthlyCompiles < 0) {
        expect(compiles).toBe('Unlimited compiles');
      } else {
        expect(compiles).toContain(entitlements.maxMonthlyCompiles.toLocaleString('en-US'));
      }
      if (entitlements.maxSeats < 0) {
        expect(seats).toBe('Unlimited seats');
      } else {
        expect(seats).toContain(String(entitlements.maxSeats));
      }
      if (entitlements.maxTokensPerCompile < 0) {
        expect(budget).toBe('Unbounded compile budget');
      } else {
        expect(budget).toContain(entitlements.maxTokensPerCompile.toLocaleString('en-US'));
      }
    }
  });

  it('the pricing page source contains no hand-copied catalog numbers', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'app', 'pricing', 'page.tsx'),
      'utf8',
    );
    // Numbers reach the page only through planDisplays(): no dollar literals, no
    // localized thousands, no entitlement-shaped lines ("N compiles/seats/-token"), and
    // none of the catalog's own values as standalone words (spacing/stagger utilities
    // like py-24 or delay={120} are classes and numeric props, not copy).
    expect(source).not.toMatch(/\$\s*\d/);
    expect(source).not.toMatch(/\b\d{1,3}(?:,\d{3})+\b/);
    expect(source).not.toMatch(/\d[\d,]*\s+(?:compiles|seats?)\b/);
    expect(source).not.toMatch(/\d[\d,]*-token/);
    for (const id of PLAN_IDS) {
      const plan = PLANS[id];
      if (plan.priceCents > 0) {
        expect(source).not.toContain(String(plan.priceCents / 100));
        expect(source).not.toContain(String(plan.priceCents));
      }
    }
  });
});
