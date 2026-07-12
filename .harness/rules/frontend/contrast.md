# Rule: Contrast (WCAG AA — executable)

Applies to **every web app** (`apps/web`, `apps/marketing`, `apps/docs` when it lands).
Authority: [ADR-0047](../../../docs/adr/0047-dashboard-multi-theme-illustration-layer-contrast-gate.md),
[DESIGN-SYSTEM.md §8.1](../../../docs/design/DESIGN-SYSTEM.md). Operational workflow:
the [`contrast-checker`](../../skills/contrast-checker/SKILL.md) skill.

## The rule

1. **Normal text** on its background: contrast ratio **≥ 4.5:1** (WCAG 2.1 SC 1.4.3).
2. **Large text** (≥ 24px, or ≥ 18.66px bold) and **non-text UI** that must be perceived
   (focus ring vs. canvas, input boundary vs. canvas): **≥ 3:1** (SC 1.4.3 + 1.4.11).
3. This holds for **every theme × mode combination** the app ships (dashboard: 4 themes ×
   light/dark), not just the default.
4. **Enforcement is executable, not aspirational.** The dashboard's registered token
   pairings are asserted by `apps/web/tests/contrast.test.ts` inside the standard `test`
   gate. A pairing that isn't registered isn't protected — see rule 6.
5. **Fix the token, never the check.** When a pairing fails: apply the smallest
   oklch-lightness (or alpha) nudge that passes, keep the theme's character, and leave a
   short CSS comment (`/* nudged from X for AA */`). Deleting/loosening a registered pair
   or threshold is a design decision → DESIGN-SYSTEM.md + ADR amendment, with review.
6. **New pairings register on introduction.** If a change renders text with a token
   combination not yet in the registry (e.g. `--chart-3` used as text on `--card`), the
   same change must add it to the checker's pair list.

**Why:** an unenforced "meets AA" line sat in DESIGN-SYSTEM.md §2.1 from v1 while real
token pairs drifted below 3:1. Only a gate that fails the build survives iteration speed.

## Do / Don't

- **Do** run the checker locally before proposing token changes:
  `pnpm --filter @tessera/web test -- contrast`.
- **Do** verify *rendered* edge cases axe can't derive from tokens (text over
  illustrations/gradients) by screenshot during design review.
- **Don't** hardcode colors to dodge the registry (also banned by the token rule).
- **Don't** treat `--muted-foreground` as decoration — it is body text on `--background`,
  `--card`, **and** `--muted`; it must clear 4.5:1 on all three.
- **Don't** rely on hue for state (up/down, error) — pair with an icon/sign; contrast is
  about luminance, and color-blind users need the redundant channel anyway.
