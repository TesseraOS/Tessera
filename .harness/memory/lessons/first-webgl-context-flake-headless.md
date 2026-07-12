---
id: first-webgl-context-flake-headless
kind: lesson
title: First WebGL context after a fresh headless-browser launch can flake — the page is fine
links:
  - apps/marketing/components/home/shader-field.tsx
  - .harness/skills/design-review/SKILL.md
confidence: 0.75
created: 2026-07-12
---

**What happened:** during F-067 v2 screenshot review, early captures of a legal hero
(privacy/dusk) showed a WHITE hero band where the shader field should be. Root-caused
empirically by reordering: the **first WebGL context created right after a fresh
headless/automation browser launch intermittently fails** (`CONTEXT_LOST_WEBGL`) on this
machine — whichever subpage hero renders first eats the flake (it hit /features when the
order changed); privacy/gdpr/etc. render the warm shader perfectly once past it. It is
page- and code-independent, self-heals (the canvas reaches opacity 1 on a later frame),
and does NOT reproduce in the e2e suite's long-lived browser.

**How to apply:** a blank/white shader hero in a FIRST automation screenshot is a capture
environment artifact, not a component bug — re-navigate / warm the tab and recapture before
touching ShaderField or the ShaderFieldLazy boundary. Cross-checks that it's the flake and
not real: `read_page`/DOM shows the canvas element present and sized, no console error on a
reload, e2e axe passes on the same route. Related capture-artifact lesson:
[[whileinview-reveals-vs-fullpage-screenshot-capture]].
