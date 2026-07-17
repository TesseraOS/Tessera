# @tessera/brand

The Tessera logo system — **one definition of the mark, for every app**.

Canonical spec: [`docs/design/BRAND.md` §4](../../docs/design/BRAND.md). Master artwork:
[`docs/design/brand/tessera-mark.svg`](../../docs/design/brand/tessera-mark.svg). This package is a
port of that master; the master wins if they ever disagree.

## Why this package exists

It used to be a component in each app, and they diverged: marketing shipped **mark v2** while the
dashboard still rendered **v1** — a monochrome pixel mark on a different viewBox, a different logo —
for as long as v2 had existed. Two hand-maintained copies of a brand asset drift the moment one is
updated. Don't fork it back out.

## Usage

```tsx
import { Logo, LogoIcon } from '@tessera/brand';

<LogoIcon className="size-5" />
<Logo textClassName="text-xl" emberId="ember-signin" />
```

**`emberId`** — SVG gradient ids are *document-global*. A page rendering more than one mark must give
each a distinct id, or the second silently retargets the first's gradient.

**Size is the caller's.** It is contextual — a nav, a footer and a sign-in card legitimately differ —
so each app passes it and keeps its own type scale. Everything else here is a brand *rule*
(lowercase, serif, never bold) and is not overridable by accident.

## Theming — the closed `--brand-*` contract

| Token | Falls back to | Meaning |
|---|---|---|
| `--brand-ember-from` | `currentColor` | ember gradient start (rose) |
| `--brand-ember-to` | `currentColor` | ember gradient end (gold) |
| `--brand-wordmark-font` | `ui-serif, serif` | the lockup's face — Instrument Serif |

The mosaic tiles ride `currentColor` and need no binding: theme-true for free.

**Unbound is safe.** Every value falls back, so an app that binds nothing renders a *monochrome*
mark — which BRAND.md §4 explicitly sanctions ("all-ivory, or all-espresso on light"). Never an
invisible tile. (Same guarantee, and the same reasoning, as `@tessera/mascot`.)

**Bind per mode, never per theme.** BRAND.md §4: never recolor the mark outside the palette. The
mascot takes each theme's warm accent because ADR-0047 licensed exactly that, *for the mascot* — the
mark is not the mascot. See ADR-0053-era bindings in each app's `globals.css`.

## Known exception

`apps/*/app/icon.tsx` (the favicon) restates the geometry instead of importing `LogoIcon`. It renders
through **Satori** (`next/og`), which does not rasterize SVG gradients, so the mark has to be rebuilt
from positioned divs. It is the only sanctioned copy; change it whenever the geometry here changes.
