# Plan: F-067 Marketing legal pages — privacy, terms, cookies, imprint + legal footer surface

- **Feature:** F-067 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-67, NFR-17 (from [`../../docs/PRD.md`](../../docs/PRD.md)); touches NFR-18 (open-core license honesty, OQ4) without resolving it
- **Service / package:** `apps/marketing` (`@tessera/marketing`)
- **Author:** Claude (planner subagent) · **Date:** 2026-07-12
- **Blocked by:** F-051 (done) · **Effects:** E-022 (extended)
- **Selection note:** F-067 claimed by explicit stakeholder direction (2026-07-12, "start with remaining marketing work"), ahead of lowest-id-eligible F-044 — same user-directed pattern as F-066.

## Intent

Give the marketing site a complete, honest legal surface: `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/imprint`, rendered through one shared legal-page treatment (serif headings, ~65ch prose measure, token tables), linked from a new **legal** footer column, indexed in sitemap + llms.txt, axe-AA green on both themes.

Done for a user: every legal route loads statically with real, current facts about what Tessera does and stores; every fact we *cannot* yet state (entity, jurisdiction, contact email, exact OSS license) renders as a visually distinct, clearly-labeled **counsel-review placeholder** — nothing fabricated, and the placeholder set is tracked in this plan and pinned by a unit test.

## Ground truths this plan is built on (verified read-only, 2026-07-12)

- **Footer has no legal column** — `components/site-footer.tsx` has 3 columns (product / resources / get started) on `md:grid-cols-12` (brand `col-span-5` + 3×`col-span-2` = 11 cols). A 4th column requires a grid rebalance.
- **No prose/table primitive exists** in `components/ui/*`; §3 of MARKETING-DESIGN v4.8 has **no legal/prose archetype** (closest precedents: §3.12 `page-header`, §3.13 `not-found` — a *quiet base-ground* page without the shader). Improvising a section shape is banned (marketing-ui skill step 1) → **doc + manifest amendment required** (manifest currently `4.8.0` → `4.9.0`).
- **Storage reality for the cookies page:** zero `document.cookie` / `localStorage` / `sessionStorage` references in app source; the only client persistence is **next-themes'** own `theme` localStorage key via the `lib/theme.tsx` seam; fonts self-hosted; zero third-party requests (manifest budget + design-lint `script-tags-and-third-party`). The site sets **no cookies**. (Exact write timing of the `theme` key — first load vs. first toggle — must be verified empirically and worded from evidence; e2e will pin it.)
- **License reality for the terms page:** **no `LICENSE` file exists at the repo root or in any package, and no `package.json` declares a `license` field.** PRD OQ4 resolved the *model* (open-core: permissive-OSS core + paid managed cloud) but the concrete license text is unchosen. `/legal/terms` may describe the open-core split; the specific repository license is a **placeholder**, not a citation.
- **Contact reality:** `lib/site.ts` has name/tagline/description and three env-driven URLs — **no email, no entity, no address exist anywhere**. Design-lint additionally bans hardcoded `tessera.*` domains, so an invented `privacy@tessera.dev` would fail two rules at once.
- **e2e today:** 27 specs across `home.spec.ts` (8) / `pages.spec.ts` (11 = 2×4 subpages + 3) / `mascot.spec.ts` (8), Playwright chromium against the production build on port 3200. Subpages are covered by a parameterized `PAGES` array (axe both themes via the footer "Noon" toggle, one h1, 375px overflow) and the sitemap/llms test iterates the same array — legal pages can join it wholesale.
- **Mascot:** ADR-0046 usage budget (manifest `mascot-usage-budget` allowIn) bans `@tessera/mascot` outside site-nav / not-found / constellation-band / dev-lab. **Legal pages must not import the mascot** — no allowIn change.
- **Budget:** first-load JS ≤ 240KB gz (manifest); measured baselines 226.5KB (home) / **191.5KB (404, the shader-free page class legal pages will match)**.
- **Marketing unit tests:** 45/45 (design-lint compiles the manifest; pricing display-model proof). Workspace turbo 71/71.

## Approach

### Design decision (increment 1 — before any page code, recorded per house precedent)

Add a **`legal-prose` archetype (§3.14)** to MARKETING-DESIGN.md + manifest `4.9.0` in lockstep, recorded as an **ADR-0045 amendment — v4.9** (same mechanism as the v4.4 subpage-system amendment; ADR-0045 amendments currently end at v4.5, the mascot took v4.6–4.8 in ADR-0046):

- **Opening:** a **compact quiet opening on the base ground** — label eyebrow (e.g. `legal — privacy`), serif `title`-token h1, lead ≤56ch, a "last updated" line, and a `Badge` reading **draft — pending counsel review**. *No shader field, no `min-h-svh`.* Precedent: §3.13 not-found already established that utility pages sit on the quiet base ground; a full-viewport WebGL hero over a privacy policy would push the document below the fold and spend budget on the wrong thing. This is a deliberate, recorded deviation from §3.12 `page-header` — flagged for review; the zero-amendment fallback (reuse `PageHeader` verbatim) is noted in Risks.
- **Body:** single-column article, `max-w-prose` (~65ch, inside §2.4's 60–72ch body rule); h2s are serif via the existing base layer on the **`heading`** size (serif headings without display-scale shouting), h3s `text-body font-medium`; lists; **token tables** (hairline `border`, `text-small` cells, `th scope="col"`, visible caption) for data categories / retention; static server components only, no client islands.
- **`CounselReview` placeholder block:** a visually distinct callout — **dashed `border-strong`, `bg-surface`, `text-label` eyebrow "pending counsel review"** — deliberately spending **zero accent** (rose/gold budgets untouched; no third hue). Rendered as `<aside role="note" aria-label="Pending counsel review">`. Every unresolved fact renders through this block, never as prose.
- **Manifest changes (exact, minimal):** `version` → `4.9.0`, `updated` → 2026-07-12; `sections[]` += `"legal-prose (v4.9, F-067: /legal/* — compact quiet opening on the BASE ground (no shader, no min-h-svh: label eyebrow · serif TITLE-token h1 · lead · updated line + draft-pending-counsel Badge), then a single-column max-w-prose article: serif h2s on the heading size, token tables (hairline borders, text-small cells, caption) for data categories/retention, and CounselReview placeholder callouts (dashed border-strong asides, role=note) for every unresolved entity/jurisdiction fact — NO fabricated legal facts; static server components only)"`; `components[]` += `"LegalArticle(typed LegalBlock renderer: headings/paragraphs/lists/tables + CounselReview callout — legal pages only)"`. **No banned/required-pattern changes and no `allowIn` changes** — existing patterns (closed type scale, tokens-only, metadata-required via the `app/**/page.tsx` glob) cover the new files automatically.

### Content as typed data (house precedent: PLANS display model, mascot moods)

One content model, one renderer — so styling lives in exactly one file and the honesty rule becomes *testable*:

```ts
// lib/legal/types.ts
export type LegalBlock =
  | { kind: 'heading'; level: 2 | 3; id: string; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered?: boolean; items: readonly string[] }
  | { kind: 'table'; caption: string; head: readonly string[]; rows: readonly (readonly string[])[] }
  | { kind: 'counsel'; id: CounselId; summary: string; detail: string }; // the ONLY way to state an unresolved fact

export interface LegalDoc {
  slug: 'privacy' | 'terms' | 'cookies' | 'imprint';
  eyebrow: string; title: string; lead: string;
  updated: string;              // real ISO date, never a future "effective" claim
  blocks: readonly LegalBlock[];
}
```

`CounselId` is a closed union (`'entity' | 'address' | 'jurisdiction' | …` — the tracked list below), so a fabricated fact can't slip in as a new placeholder unnoticed and a dropped placeholder fails typecheck/tests.

**Routing shape:** `app/legal/layout.tsx` carries `SiteNav` + `<main>` + `SiteFooter` once; each `app/legal/<slug>/page.tsx` is just `metadata` + its `LegalDoc` import + `<LegalArticle doc={…} />`.

### Page content (honest structure)

- **`/legal/privacy`** — GDPR/CCPA-aware skeleton: who we are (controller → *counsel: entity, address, contact-email*); scope; **data on this website** (truthfully: no accounts, no forms, no cookies, no analytics; hosting-provider server logs → *counsel: processors*); **data in the product** (local/self-hosted: your content stays in your deployment — structurally true per ADR-0003; managed cloud: pre-launch, retention → *counsel: retention*); purposes & legal bases; processors/subprocessors (*counsel*); international transfers (*counsel*); your rights (GDPR arts. 15–21, CCPA access/deletion/no-sale — phrasing *counsel-flagged*); exercising rights (*counsel: contact-email*); supervisory authority (*counsel*); changes.
- **`/legal/terms`** — the SaaS + open-core split: **service terms** (managed cloud — honestly marked *not yet generally available*; accounts, acceptable use, plan limits by reference to `/pricing` — **link, never hand-copied numbers**, keeping E-019 untouched; payment processing → *counsel: payments*; disclaimers/liability → *counsel: jurisdiction*) vs **repository licenses** (self-hosted/local use is governed by the repository's open-source license; the model is open-core per OQ4; the exact license → *counsel/maintainer: oss-license* — **cite nothing until a LICENSE file exists**).
- **`/legal/cookies`** — the honest one, e2e-backed: this site sets **no cookies** (first- or third-party); one localStorage entry stores your theme choice (exact write timing worded from verified behavior); zero third-party requests, fonts self-hosted, no analytics; scope note: covers the marketing site only, other surfaces carry their own notices; how to clear the stored preference.
- **`/legal/imprint`** — operator identity: product name + repository facts (real), then *counsel: entity, address, representative, register-number, jurisdiction, contact-email* as placeholder blocks. This page is mostly placeholders by design — acceptance #3 sanctions exactly that.

### Tracked counsel-review placeholder list (the contract; unit-test-pinned)

| id | fact | appears on |
|----|------|-----------|
| `entity` | operating legal entity name + form | privacy, terms, imprint |
| `address` | registered address | privacy, imprint |
| `representative` | authorized representative(s) | imprint |
| `register-number` | commercial register / company number, VAT ID | imprint |
| `jurisdiction` | governing law, venue | terms, imprint |
| `contact-email` | legal/privacy contact mailbox (none exists; TLD undecided) | privacy, cookies, imprint |
| `dpo` | DPO / EU-representative requirement + identity | privacy |
| `processors` | processor/subprocessor list incl. marketing-site hosting | privacy |
| `retention` | managed-cloud retention schedules | privacy |
| `transfers` | international-transfer mechanism | privacy |
| `supervisory-authority` | competent authority reference | privacy |
| `oss-license` | exact repository license (OQ4 model resolved; text/file not committed) | terms |
| `payments` | payment-processing/merchant-of-record specifics (ADR-0011 Dodo is coded, not live) | terms |
| `rights-phrasing` | GDPR/CCPA rights wording sign-off | privacy |

Content notes on each page state that these sections require counsel sign-off before launch.

## Files to touch

**Increment 1 — governance (no app code):**
- `docs/design/MARKETING-DESIGN.md` — header → v4.9; new §3.14 `legal-prose`; §4 += `LegalArticle`.
- `docs/design/marketing-design.manifest.json` — `4.9.0` (sections + components + updated), exactly as specified above.
- `docs/adr/0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md` — "Amendment — v4.9 (2026-07-12, F-067 legal-prose archetype)".
- `.harness/plans/F-067-legal-pages.md` — this document (plan-before-code; `verify-state` enforces it for the in-progress feature).

**Increment 2 — rig + first page + footer:**
- `apps/marketing/lib/legal/types.ts` — `LegalBlock` / `LegalDoc` / `CounselId`.
- `apps/marketing/lib/legal/privacy.ts` — the privacy `LegalDoc`.
- `apps/marketing/components/legal-article.tsx` — `LegalArticle` renderer + `CounselReview` callout + table rendering (the only styling surface).
- `apps/marketing/app/legal/layout.tsx` — SiteNav + main + SiteFooter shell.
- `apps/marketing/app/legal/privacy/page.tsx` — metadata (title ≤60ch, description 140–160ch, `alternates.canonical: '/legal/privacy'`) + render.
- `apps/marketing/components/site-footer.tsx` — new **legal** column (Privacy / Terms / Cookies / Imprint); brand block `md:col-span-5` → `md:col-span-4` so 4 + 4×2 = 12 (375px stacking unchanged; overflow tests will police it).
- `apps/marketing/tests/legal-content.test.ts` — see Test plan.
- `apps/marketing/tests/e2e/pages.spec.ts` — `PAGES` += `/legal/privacy` (+ its h1 fragment).

**Increment 3 — remaining pages + plumbing:**
- `apps/marketing/lib/legal/terms.ts`, `cookies.ts`, `imprint.ts` + `app/legal/{terms,cookies,imprint}/page.tsx`.
- `apps/marketing/app/sitemap.ts` — four `/legal/*` entries (`changeFrequency: 'yearly'`, `priority: 0.3`).
- `apps/marketing/app/llms.txt/route.ts` — new `## Legal` section listing the four pages (honest one-liners incl. the counsel-draft status).
- `apps/marketing/tests/e2e/pages.spec.ts` — `PAGES` += the other three (sitemap/llms coverage extends automatically).

**Increment 4 — proof + record:**
- `apps/marketing/tests/e2e/legal.spec.ts` — truth checks (below).
- `.harness/state/effects.json` — extend **E-022** `to`: legal-prose archetype + `LegalArticle`/legal content consumers; note the footer contract change (legal column) for nav-surface dependents.
- `.harness/state/feature_list.json` (F-067 → `done`), `.harness/state/progress.md`, `.harness/memory/` if a lesson emerges.

**Explicitly not touched:** `components/site-nav.tsx` (legal stays footer-only — adding nav links would be scope creep), `@tessera/billing`/PLANS (terms links to `/pricing` instead of citing numbers), mascot allowIn, robots.ts (legal pages are indexed — no noindex).

## Anticipated effects

- **E-022 (marketing design contract):** gains §3.14 legal-prose + `LegalArticle` as governed consumers; the doc/manifest bump to 4.9 must land in lockstep or design-lint's manifest-integrity premise drifts. Recorded via effect-trace at the end.
- **Footer contract:** every page renders `SiteFooter`; the column rebalance is visible site-wide. Known dependents checked: `home.spec.ts` targets only the footer's "Noon" toggle by role (safe); mascot specs don't touch the footer; the 375px overflow tests on all routes are the regression net for the grid change. No visual snapshot tests exist — screenshot review covers it.
- **E-019 (PLANS):** deliberately *not* extended — terms references `/pricing` by link only.
- **Sitemap/llms.txt consumers** (e2e `PAGES` iteration, future docs surface): grow by four routes — additive.

## Test plan

- **Unit (`tests/legal-content.test.ts`):**
  - Placeholder pinning: the union of `counsel` block ids across all four `LegalDoc`s **exactly equals** the tracked table above (per-doc sets asserted too) — a fabricated fact replacing a placeholder, or a silently dropped placeholder, fails the build.
  - Fabrication tripwires on all non-counsel text: no entity suffixes (`GmbH|Inc\.|LLC|Ltd`), no street/register-number shapes (`HRB \d`), no email addresses, no `tessera\.(dev|com|io|ai|app)` domains, no invented compliance claims (`SOC ?2|ISO ?27001|GDPR[- ]compliant`).
  - Structure: unique heading ids; levels never skip (h3 only under an h2); table `rows[i].length === head.length`; `updated` is a valid ISO date not in the future; leads ≤56ch discipline spot-check.
  - Voice: since design-lint's `hype-vocabulary`/`exclamation-in-copy` patterns scan `**/*.tsx` only and this content lives in `lib/legal/*.ts`, the unit test re-applies the manifest's banned-word regex + exclamation check to legal copy (no contract weakened, coverage extended).
- **Design-lint:** runs unchanged over the new files (`app`/`components`/`lib` are already in `SCAN_DIRS`); metadata-required pattern auto-covers the four new `page.tsx`.
- **E2E (`pages.spec.ts` extension):** the four legal routes join `PAGES` → per route: exactly one h1 (fragment-matched), axe WCAG 2.1 AA zero violations on dusk **and** noon (footer-toggle path), 375px no horizontal overflow; sitemap + llms.txt listing asserted by the existing iteration.
- **E2E (`legal.spec.ts`, new — the truth checks):**
  - each `/legal/*` `goto` response status === 200;
  - homepage footer exposes a `legal` nav landmark with the four links whose hrefs resolve;
  - imprint + privacy render ≥1 visible "pending counsel review" callout (placeholders can't silently vanish);
  - **cookies-page claims are executable:** fresh load of `/legal/cookies` → `document.cookie === ''`; enumerate `localStorage` keys before/after using the theme toggle and assert they match exactly what the page's copy claims; capture `page.on('request')` during load → every request same-origin (the zero-third-party statement, proven).
  - Suite grows 27 → ~37 specs; all four pages are static and shader-free, so runtime cost is minimal.
- **Screenshot review (MARKETING-DESIGN §8):** 4 pages × {1440×900, 375×812} × {dusk, noon} + reduced-motion pass + footer close-up on home (grid rebalance) + brand-swap test; reviewed against §8, then a `design-review` skill pass.

## Verification

Gates in order, with evidence per [`../protocols/verification.md`](../protocols/verification.md):

1. `node scripts/verify-state.mjs`
2. `pnpm -w typecheck`
3. `pnpm -w lint`
4. `pnpm -w format:check`
5. `pnpm -w test` (includes design-lint against manifest 4.9.0 + the new legal-content suite; marketing unit count grows from 45)
6. `pnpm -w build`
7. `pnpm -w test:e2e` (marketing suite 27 → ~37; also runnable filtered: `pnpm --filter @tessera/marketing test:e2e`)

Budget evidence: `next build` route table — each `/legal/*` first-load JS expected ≈ the 404's **191.5KB gz** class (shared shell only, no shader/constellation chunk), comfortably under the **240KB gz** cap; zero hydration errors on a fresh server; zero third-party requests (asserted in e2e). Screenshots + design-review recorded as evidence. Then effect-trace (E-022), `progress.md`, F-067 → `done`, checkpoint; commit per the standing cadence (one commit per verified increment; no push without request).

## Increments (each leaves the build green)

1. **Governance:** ADR-0045 amendment v4.9 + MARKETING-DESIGN v4.9 + manifest 4.9.0 + this plan committed → `verify-state` + `pnpm --filter @tessera/marketing test` green (design-lint proves lockstep).
2. **Rig + privacy + footer:** types, `LegalArticle`/`CounselReview`, legal layout, `/legal/privacy`, footer legal column, legal-content unit test, `PAGES` += privacy → gates + screenshots (footer both themes).
3. **Remaining pages + plumbing:** terms/cookies/imprint content + pages, sitemap, llms.txt, `PAGES` += 3 → gates.
4. **Proof + record:** `legal.spec.ts` truth checks, full gate run, screenshot/design-review evidence, budget numbers, effect-trace, progress + status, checkpoint.

---

# v2 — stakeholder review round (2026-07-12): expressive frame, calm document

**Stakeholder verdict on v1:** *"too dull, lifeless, lacking design and creativity; the
first section should be a full-height hero like the homepage; most pages lack
illustrations; add creative, polished, interactive, animated illustrations — artistic
masterpieces; add a GDPR page; soften the draft badge; capture pending items in the
harness."* Direction confirmed via decision prompt: **expressive frame, calm document**
(hero + signature art per page; the article body stays §3.14-calm). This repeats the
F-051/F-066 lesson ([[design-contract-mechanism-outlives-parameters]] — this project lead
reads austere minimalism as lifeless); v1's compact opening was the wrong call and its
recorded fallback (PageHeader reuse) becomes the rule, extended with per-page art.

## v2 scope

1. **Hero:** all legal pages (now five) open with §3.12 `PageHeader` — full-height shader
   ground, eyebrow/title/lead from the LegalDoc, the updated-line + softened Badge as
   `children`, and a bespoke **legal signature art** in the `art` slot. The §3.14 body
   article below is unchanged (calm, max-w-prose, tables, counsel callouts).
2. **Signature arts** (components/art/legal-*.tsx, one per page — honest product truths in
   the house art language; motion-seam imports only, SSR-deterministic markup, reduced-
   motion = designed still scene, decorative-interactive per the canvas/art lessons,
   `role="img"` + aria-label, tokens-only, no new deps):
   - privacy → **RedactionGate**: content tiles stream through a gate; secret-shaped
     glyphs mask as they pass (F-006 redaction, shipped truth). Hover = inspection lens.
   - terms → **TwoCovenants**: one engine core, two grounds — open field (self-host) vs
     managed canopy (cloud); tiles flow through both under different light.
   - cookies → **OneTile**: a near-empty storage shelf; the single `theme` tile lights
     only when touched — echoing the page's e2e-proven localStorage truth.
   - imprint → **Nameplate**: the nine-tile seal assembles over engraved slots that stay
     visibly empty (the counsel placeholders, as art).
   - gdpr → **RightsLedger**: a request tile arrives; an export copy leaves the vault; an
     erased tile dissolves (rights model — no live-feature claim; F-047 ships the product
     side later).
3. **/legal/gdpr — "GDPR at Tessera"** (posture page, NOT a compliance claim — the
   fabrication tripwire banning "GDPR-compliant" stays): roles (self-hosted = the
   customer's own infrastructure per ADR-0003 — structural truth; managed cloud pre-GA),
   data-subject-rights mapping, DPA + transfers as counsel placeholders. `CounselId`
   union +`dpa` → **15 ids**; per-doc pins updated (the tracked table below gains a row).
4. **Badge softened:** page-level Badge becomes **"preliminary — final on incorporation"**
   (stakeholder decision; per-section counsel callouts and their aria-labels unchanged —
   facts are still unknown, so the marking mechanism stays).
5. **Plumbing:** footer legal column gains GDPR (5 links, column count unchanged);
   sitemap/llms.txt/e2e PAGES + legal.spec extended; metadata per house rules.
6. **Harness capture:** F-067 reopened `in_progress` with the v2 acceptance bullet
   (house F-066 precedent); **F-069** (backlog, R4 must, blockedBy F-067) now carries
   domain/mailbox wiring + counsel-fact replacement + trademark clearance; domain research
   recorded there (RDAP 2026-07-12: plain tessera.* all registered except
   `tessera.platform`; `tessera.dev` for sale on Afternic; fallbacks tesseraos.dev/.io/.app
   free). Wiring happens only after booking + live mailboxes — no fabricated domains.

## v2 governance (increment 1, before code)

- ADR-0045 **amendment v4.10**: legal-prose opening changes from the compact quiet opening
  to §3.12 PageHeader + legal signature arts (v4.9's recorded fallback, promoted; the
  compact opening is retired), badge wording, GDPR page in the legal set.
- MARKETING-DESIGN v4.10 + manifest **4.10.0** in lockstep: §3.14 legal-prose section text
  updated (opening = page-header + legal art; body unchanged); components[] gains
  `LegalArts(RedactionGate/TwoCovenants/OneTile/Nameplate/RightsLedger …)`. No
  banned/required-pattern or allowIn changes.

## v2 test/verification deltas

- legal-content.test.ts: pins grow to 15 ids (+`dpa` on gdpr); gdpr doc joins every
  structural/tripwire/voice battery; badge-text assertion if present updates.
- e2e: PAGES += /legal/gdpr (axe both themes, one h1, 375px); legal.spec footer column
  expects 5 links; counsel-callout visibility adds gdpr; art presence asserted via
  role=img labels on each legal hero; reduced-motion still verified in the motion proof.
- Budget: heroes add the SHARED shader chunk (already on all other subpages) + art code;
  measure over the wire per [[turbopack-route-table-no-first-load-js]]; ≤240KB gz holds.
- Full gate battery + independent evaluator + screenshot review (5 pages × 2 themes ×
  2 widths + reduced-motion) + design-review skill pass, as v1.

## v2 increments

1. Governance (ADR v4.10 + doc/manifest 4.10.0) — design-lint green.
2. PageHeader adoption on the four existing pages + badge softening (no arts yet) — gates
   + screenshots (proves the hero register before art lands).
3. The five signature arts + wiring into the heroes — gates + motion proof + screenshots.
4. /legal/gdpr (content + page + counsel-id extension + plumbing) — gates.
5. Full battery + evaluator + record (progress, E-022 v2 note, feature done) + checkpoint.

## Risks / open questions

- **OQ-1 (stakeholder, blocks placeholder `oss-license` only — not this feature):** choose and commit the concrete permissive license (MIT vs Apache-2.0) + root `LICENSE` file. OQ4 resolved the *model*; the file is an NFR-18 launch item and needs its own ADR. Until then `/legal/terms` keeps the placeholder — **do not** create a LICENSE inside F-067 (scope creep).
- **OQ-2 (stakeholder):** legal/privacy contact channel. No email exists and the TLD is undecided; the maintainer's personal email must not be published. Placeholder until an operator mailbox exists.
- **OQ-3 (counsel, post-feature):** the entire tracked table above — entity, address, jurisdiction, DPO, processors, retention, transfers, payments, rights phrasing.
- **Design deviation flagged for review:** the compact legal opening deviates from §3.12's full-height `page-header`. It is recorded in the v4.9 amendment (precedent: §3.13's quiet base ground). Fallback if review rejects it: reuse `PageHeader` verbatim (art-less) — pages then inherit the shader hero; no other part of this plan changes.
- **Risk — footer grid rebalance regressions:** site-wide visual change; mitigated by the existing 375px overflow tests on every route + the footer screenshot review in both themes.
- **Risk — legal copy vs. voice/lint rules:** legal register tempts passive hype-free but wordy prose; the unit test extends the banned-word/exclamation checks to `lib/legal/*.ts` (a gap in design-lint's `.tsx`-scoped copy patterns — noted, not weakened).
- **Risk — next-themes storage wording:** whether the `theme` key is written on first load or first toggle is implementation behavior of a dependency; the generator must verify empirically and word the cookies page from the observed behavior, with the e2e assertion keeping the wording honest across next-themes upgrades.
- **Risk — over-claiming in privacy's product section:** only structural facts from shipped architecture (ADR-0003 deployment profiles, F-006 redaction, F-027 audit) may be stated as present-tense; anything cloud-operational stays future-tense or counsel-flagged. The evaluator should read the four content files against this rule.
