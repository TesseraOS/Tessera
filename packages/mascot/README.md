# @tessera/mascot

**Tess** — the Tessera brand mascot (ADR-0046, BRAND.md §5): a compact figure of nine
rounded-square tesserae with the gilded ember tile as its heart. Expression is pure brand
language — posture, alignment, rhythm, light — never an eyes-and-gloves cartoon face.

Shared across frontends: marketing today, dashboard (F-068) and docs later. Zero runtime
dependencies; React is a peer.

## Use

```tsx
// once per app (e.g. the root layout):
import '@tessera/mascot/styles.css';

import { Mascot } from '@tessera/mascot';

// decorative (aria-hidden):
<Mascot mood="greeting" size={72} />

// named image:
<Mascot mood="lost" size={160} title="Tess, missing a tile" />

// interactive — a real button; click plays the one-shot re-seat gesture:
<Mascot mood="idle" interactive title="Tess, the Tessera mascot" />
```

| Prop | Default | Notes |
|------|---------|-------|
| `mood` | `'idle'` | A predefined `MoodName` or a `defineMood()` definition. |
| `size` | `96` | Square edge, px. Clamped to ≥ `MIN_SIZE` (24) — the legibility floor. |
| `title` | — | Accessible name. Absent ⇒ decorative `aria-hidden`. **Required** with `interactive`. |
| `interactive` | `false` | Wraps Tess in a `<button>`; click plays the re-seat. |
| `onActivate` | — | Called on activation. |

## Moods

Core (ADR-locked): `idle` · `curious` · `working` · `satisfied` · `alarmed` ·
`celebrating`. Surface: `greeting` (menus) · `lost` (404) · `searching` (empty states) ·
`watching` (telemetry supervisor). Each ships a `description` — use it for sibling
sr-only text. Tess must never be the sole carrier of information.

Custom moods are **data**:

```ts
import { defineMood } from '@tessera/mascot';

const waiting = defineMood({
  name: 'docs-waiting',
  description: 'Tess waits patiently beside the docs search.',
  poses: { crown: { rotate: 4 } }, // unlisted slots stay seated
  rhythm: { breathPeriodMs: 11000, breathIntensity: 0.4, driftAmp: 1 },
});
```

`defineMood` validates slot coverage, the thermal budgets (offsets ≤12, rotation ≤20°,
scale 0.9–1.15, breath 9–14s, drift ≤6) and that the heart never disappears.

## Theming — the closed `--mascot-*` contract

Bind these in the consuming app's global stylesheet (see
`apps/marketing/app/globals.css` for the Terra Mosaic binding). Unbound values fall back
to `currentColor` — a monochrome Tess, the logo's own fallback stance.

| Variable | Role |
|----------|------|
| `--mascot-tile` | base tesserae |
| `--mascot-tile-warm` | warm accent tile(s) |
| `--mascot-tile-deep` | deep/clay tile(s) |
| `--mascot-heart` | the gilded heart + its ember glow |
| `--mascot-sheen` | the one-shot glint (keep it light on both themes) |
| `--mascot-ink` | reserved: seams/sockets on future surfaces |

## Motion guarantees

All motion is package CSS — consumers inherit no animation library. Transform/opacity
only, the house ease `cubic-bezier(0.22, 0.61, 0.36, 1)`; mood morphs 600ms
(interruptible by construction), hover acknowledge 200ms, one-shot re-seat + sheen
1100ms, heart breath 9–14s. `prefers-reduced-motion: reduce` stops everything — the
mood's pose **is** its designed still frame. Server markup is identical for every mood
and client state (only attribute values vary), so hydration can never mismatch.

## Brand masters

`docs/design/brand/tessera-mascot.svg` and `tessera-mascot-moods.svg` are **generated**
from the mood data (`pnpm --filter @tessera/mascot render-masters`, after `build`) and
drift-tested — regenerate, never hand-edit.

## Verify

`pnpm --filter @tessera/mascot typecheck | lint | test | build`
