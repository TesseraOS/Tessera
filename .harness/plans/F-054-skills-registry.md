# Plan: F-054 Skills registry — first-party SKILL.md skills + /skills page + install via download/CLI/MCP

- **Feature:** F-054 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-69 ([`../../docs/PRD.md`](../../docs/PRD.md) §6.10) — "first-party agent skills (SKILL.md) teaching Tessera workflows; browsable `/skills` page; installable via download/CLI/MCP". Governed by NFR-4 (token-lean agent responses), NFR-9/NFR-17 (public-web a11y + budgets), NFR-10 (Windows/macOS/Linux).
- **Decision record:** [ADR-0036](../../docs/adr/0036-agent-first-operations.md) — the skills registry is decision #3 there (note: ADR-0036's F-numbers are stale; it calls skills "F-053").
- **Service / package:** new `packages/skills` (`@tessera/skills`) + `apps/mcp` + `apps/cli` + `apps/marketing` (+ regenerated `apps/docs` artifacts)
- **Author:** planner subagent · **Date:** 2026-07-21

## Intent

Ship the four first-party agent skills as a **versioned in-repo registry with one engine and three surfaces**: the marketing catalog, the CLI, and MCP all render/serve the *same* SKILL.md bytes, so no surface can hand-copy content and none can drift.

"Done" for a user: an agent connected to Tessera calls `list_skills` / `get_skill` and writes the skill into its own skills directory without a browser; a human runs `tessera skills install compile-before-coding` and gets `.claude/skills/compile-before-coding/SKILL.md`; a visitor browses `/skills`, filters by category, reads what a skill does and why, and downloads the raw `SKILL.md`. The four skills are real instructions grounded in Tessera's actual tool names and arguments, and a scripted MCP e2e proves an agent can both *fetch* them and *execute* what they prescribe against a real server.

## Scope guard

**In** (exactly the four `acceptance` clauses): the registry + manifest + CI validation; the `/skills` page rendered from the registry; the three install paths (download, CLI, MCP); the scripted MCP e2e + axe AA + workspace gates.

**Out** (call it out, do not build it):

- **No REST `/v1/skills` route.** The agent-first parity rule ([`../rules/common/agent-first.md`](../rules/common/agent-first.md)) binds *dashboard operations* to REST+MCP. The dashboard performs no skills operation, and the skills are already served unauthenticated as static files by the marketing site. Acceptance names exactly three install paths; a REST twin is scope creep. (Recorded here so the evaluator does not read its absence as an omission.)
- **No markdown rendering of skill bodies on the marketing site.** That needs a markdown renderer dependency and lands squarely on the banned `code-block panel` archetype. The detail page gives what-it-does / why / install and links to the raw `.md`.
- **No docs-site skills page.** F-053 is `done`; the docs reference gains the two MCP tools and the `skills` CLI command *automatically* through regeneration (see §F). A hand-written docs page is a separate item.
- **No publishing work.** `@tessera/skills` joins the F-059 publish set as a tracked note (the CLI will depend on it at runtime); this feature does not touch the release pipeline.

## Approach

### A. `packages/skills` — the registry package (increment 1)

#### A.1 On-disk layout

```
packages/skills/
  package.json                 # @tessera/skills, private (F-059 flips it), files:["dist"]
  tsconfig.json                # extends ../../tsconfig.base.json (mirrors packages/billing)
  registry/                    # THE SOURCE OF TRUTH — hand-authored skills
    compile-before-coding/SKILL.md
    effects-before-editing/SKILL.md
    capture-memory/SKILL.md
    project-onboarding/SKILL.md
  scripts/generate.mjs         # parse + validate + emit; exports generate() for the drift test
  src/
    types.ts                   # SkillManifest, SkillCategory, SkillAgentId, SkillTarget, tables
    generated/catalog.ts       # SKILLS (manifests only) + SKILL_NAMES tuple  [committed]
    generated/documents.ts     # SKILL_DOCUMENTS: name -> exact SKILL.md bytes [committed]
    index.ts                   # public entry: types + SKILLS + findSkill + targets
    content.ts                 # public entry "./content": getSkillDocument
  tests/registry.test.ts       # validation + discovery + byte-identical drift gate
```

`registry/` rather than `skills/`: the acceptance phrase "a versioned skills/ registry in-repo" names the concept, and `packages/skills/skills/` reads badly. Each skill directory name **is** the skill name (required by the Agent Skills spec).

#### A.2 SKILL.md format — the frontmatter **is** the manifest (decision)

Adopt the published Agent Skills format verbatim (ADR-0036: "adopt the emerging SKILL.md convention agents already load; zero new protocol"). Spec fields: `name` (required, 1–64 chars, lowercase alphanumerics + single hyphens, must match the parent directory), `description` (required, ≤1024 chars, says *what* and *when*), optional `license`, `compatibility` (≤500 chars), `metadata` (string→string map, namespaced keys recommended), `allowed-tools`. This is what Claude Code (`.claude/skills/`), Cursor (`.cursor/skills/`), Cline (`.cline/skills/`, `.clinerules/skills/`, and `.claude/skills/`) and Codex CLI (`.codex/skills/`) load today, and it is the same format the harness's own `.harness/skills/*/SKILL.md` already uses.

Tessera-specific structured fields go under `metadata` with `tessera.*` keys (values are strings per spec; lists are comma-separated and split by the loader):

```yaml
---
name: compile-before-coding
description: >-
  Pull a compiled, cited, budget-bounded context package from Tessera instead of reading whole
  files. Use at the start of any task that needs repository knowledge.
compatibility: Requires a connected Tessera MCP server (tessera init, or npx @tessera/cli init).
metadata:
  tessera.version: '1.0.0'
  tessera.category: workflow
  tessera.headline: Compile context, do not dump it
  tessera.why: Whole-file reading burns the window on text the task never needed.
  tessera.agents: claude-code,cursor,cline,codex
  tessera.tools: compile_context,search,explain
---
```

**Why frontmatter and not a sibling `skill.json`:** (1) two files can disagree — a manifest that travels *inside* the artifact cannot; (2) the installed artifact is a single `SKILL.md` copied into an agent's skills directory, and a sibling JSON would not travel with it; (3) the spec-conformant file is exactly what agents already parse, so "zero new protocol" stays true.

**`license` is deliberately omitted.** The repository has no LICENSE file yet and the open-source license is an unresolved counsel-review placeholder (`oss-license`, tracked by F-067 and asserted in `apps/marketing/tests/legal-content.test.ts`). Asserting a license in shipped metadata would be a fabricated legal fact. Add the field when the license lands.

#### A.3 How the bytes reach a Next static build and a published CLI (decision)

**Chosen: a committed, generated TypeScript module that embeds the manifests and the exact file bytes.** `pnpm --filter @tessera/skills generate` parses every `registry/*/SKILL.md`, validates it, and emits `src/generated/catalog.ts` + `src/generated/documents.ts` (string literals via `JSON.stringify`, so backticks and `${` in the markdown are inert; content read as UTF-8 with CRLF normalized to LF so a Windows checkout and CI produce identical bytes). All three surfaces then just `import` the package — no filesystem access, no YAML parser, and no non-`dist` files in the published tarball anywhere.

Tradeoff, stated plainly:

| | files-on-disk (loader reads `registry/**` at runtime) | generated module (chosen) |
|---|---|---|
| Next build | must `readFileSync` out of a pnpm-symlinked `node_modules`; fragile under tracing/Turbopack | plain import; nothing to trace |
| Published CLI | `files` must include non-`dist` markdown; every consumer re-parses YAML at runtime | `dist` only, like every other package; zero runtime deps |
| Source of truth | one copy | one copy — the generated file is derived, never edited |
| Cost | none | a committed artifact that must be regenerated when a SKILL.md changes |

That cost is paid by the same mechanism F-053 already proved (E-026): a **byte-compare drift test** in the package's own `test` gate. Stale generated data is a red build, not a support ticket. Note that `**/generated/**` is already ignored by ESLint (`eslint.config.mjs`) and Prettier (`.prettierignore`), and `**/*.md` is Prettier-ignored, so neither formatter can churn either side of the compare.

Validation lives in `scripts/generate.mjs` (plain `.mjs`, exporting `generate()` — the `apps/docs/scripts/generate.mjs` precedent) with `yaml` and `zod` as **devDependencies**. The published `src/` therefore keeps **zero runtime dependencies**: types, generated data, and small pure lookups.

#### A.4 Public API (`src/types.ts` + `src/index.ts` + `src/content.ts`)

```ts
export const SKILL_CATEGORIES = ['workflow', 'setup'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_AGENTS = ['claude-code', 'cursor', 'cline', 'codex'] as const;
export type SkillAgentId = (typeof SKILL_AGENTS)[number];

export interface SkillManifest {
  readonly name: string;
  readonly description: string;
  readonly version: string;          // semver, from metadata['tessera.version']
  readonly category: SkillCategory;
  readonly headline: string;         // <=8 words, sentence case (marketing h1)
  readonly why: string;              // one line: the cost of not doing it
  readonly agents: readonly SkillAgentId[];
  readonly tools: readonly string[]; // Tessera MCP tools the body instructs the agent to call
  readonly compatibility: string;
}

/** Install destinations, a DATA TABLE (the apps/cli mcp-clients.ts shape) — a new agent is a row. */
export interface SkillTarget {
  readonly id: SkillAgentId;
  readonly label: string;
  readonly projectDir: string; // '.claude/skills'
  readonly homeDir: string;    // '~/.claude/skills' (rendered form; resolved via os.homedir())
}
export const SKILL_TARGETS: readonly SkillTarget[];

export const SKILLS: readonly SkillManifest[];                  // generated, sorted by name
export const SKILL_NAMES: readonly [string, ...string[]];       // generated tuple (feeds z.enum)
export function findSkill(name: string): SkillManifest | undefined;
export function skillInstallPath(target: SkillTarget, name: string, scope: 'project' | 'home'): string;

// "@tessera/skills/content"
export const SKILL_DOCUMENTS: Readonly<Record<string, string>>;
export function getSkillDocument(name: string): string | undefined;
```

Two entry points on purpose: `list_skills`, the catalog page and `skills list` import the root (manifests only), and only the three code paths that genuinely need bytes import `./content`. The split makes the NFR-4 rule ("`list_skills` must not return bodies") structural rather than aspirational, and keeps bodies out of any client bundle. Lookups return `undefined` rather than throwing, so the package carries no error policy and each surface maps to its own idiom (`CliError` / `NotFoundError` / `notFound()`) — that is what keeps the dependency count at zero.

`SKILL_TARGETS` covers the four agents whose skills directories are documented upstream (claude-code, cursor, cline, codex). **Continue is deliberately absent** even though it is a row in `MCP_CLIENTS` (`apps/cli/src/mcp-clients.ts`): its skills location is not something we can state honestly today. Adding it later is a row, not code.

#### A.5 What CI validates (the `test` gate, `packages/skills/tests/registry.test.ts`)

The registry's "manifest validated in CI" acceptance clause is this suite:

1. **Discovery** — every directory under `registry/` yields a skill, and the set of discovered names equals `SKILLS`. (Adding a skill without regenerating fails here.)
2. **Spec conformance** — `name` matches `/^[a-z0-9]+(-[a-z0-9]+)*$/`, ≤64 chars, no leading/trailing/consecutive hyphens, and **equals its parent directory name**; `description` non-empty and ≤1024 chars; `compatibility` ≤500 chars; no unknown top-level frontmatter keys.
3. **Tessera metadata** — `tessera.version` is semver; `category ∈ SKILL_CATEGORIES`; `agents ⊆ SKILL_AGENTS` and non-empty; `tools` non-empty; `headline` ≤8 words; `why` non-empty.
4. **Uniqueness** — names unique across the registry (also guaranteed by the directory, asserted anyway so a rename cannot silently collide).
5. **Frontmatter/manifest agreement** — the parsed manifest round-trips: every field in `SKILLS[i]` is present in the raw document, and the raw document's frontmatter parses to exactly `SKILLS[i]` (no field invented by the generator).
6. **Body honesty** — every tool named in `tessera.tools` actually appears in the body, and the body stays under 400 lines (the spec's progressive-disclosure guidance is ≤500 lines / ~5k tokens; 400 keeps headroom).
7. **Drift** — `generate()` re-run in memory is byte-identical to both committed generated files.
8. **Parser unit tests** — rejects a missing closing fence, duplicate keys, and a non-string metadata value rather than mis-parsing them.

The tool-name-vs-real-catalog cross-check cannot live here (`packages/skills` must not depend on `apps/mcp`); it lives in `apps/mcp` — see §C.4.

### B. The four skills — content outlines (increment 1, same commit)

Grounded in the real tool surface (`apps/mcp/src/schemas.ts`): `compile_context {task, budget, retrievalLimit?, filters?{kinds}}`, `search {query, limit?, include?{kind,node,snippet{maxChars}}}`, `explain {task, budget?, ...}`, `get_effects {kind, key, maxDepth?}` with `kind ∈ file|symbol|module|person|decision|memory`, `query_graph {nodeKinds?, edgeKinds?, limit?}`, `assert_effect {from{kind,key}, to{kind,key}, rationale, confidence?}`, `capture_memory {kind, title, body, scope?, confidence?, metadata?}` with `kind ∈ decision|lesson|incident|failure|architecture|glossary|task`, `add_source {kind, root, label?}`, `scan_source {id}`, `list_sources`, `get_stats`.

**1. `compile-before-coding`** (workflow; tools: `compile_context`, `search`, `explain`)
- *When*: any task needing repository knowledge, before opening a single file.
- *Do*: call `compile_context` with `task` = the literal task statement and a `budget` you can afford (start 2000–4000 tokens; the package is bounded and never exceeds it). Read the returned fragments and their `ref` + provenance; cite the `ref` when you explain a change. If the package is thin, widen with `search {query, limit, include:{snippet:{maxChars:240}}}` and recompile with a larger budget or `filters.kinds`; open a whole file only after the package tells you *which* file.
- *Use `explain` sparingly*: it is the deliberate verbose path (per-fragment "why included" + the trace) — for debugging selection, not for every task (NFR-4).
- *Anti-patterns*: walking the repo tree first; a budget so large it defeats the point; ignoring citations and re-deriving what the package already proved.

**2. `effects-before-editing`** (workflow; tools: `get_effects`, `query_graph`, `assert_effect`, `search`)
- *When*: before editing any shared symbol, file, module, or contract.
- *Do*: `get_effects {kind, key, maxDepth?}` — `key` is the natural key (a file path or a symbol name). Read the ranked dependents and their paths; decide additive vs breaking; plan the dependent edits into the same change. Empty result: the node may not be indexed — check `list_sources` / `scan_source`, or explore with `query_graph {nodeKinds, edgeKinds, limit}`.
- *Record what the graph cannot infer*: `assert_effect {from, to, rationale, confidence?}` — the `rationale` is mandatory because it is what makes the link reviewable later.
- *Rule*: never edit a shared contract without running `get_effects` first; a blast radius is cheaper to read than to rediscover in review.

**3. `capture-memory`** (workflow; tools: `capture_memory`, `search`)
- *When*: after a decision, a fix, or a surprise — while the reason is still in the window.
- *Do*: `search` first for an existing memory on the same claim (supersede, do not duplicate), then `capture_memory {kind, title, body, scope?, confidence?, metadata?}`. Pick the kind deliberately: `decision` (choice + why + alternatives), `lesson` (a generalizable rule learned the hard way), `incident`/`failure` (what broke + the fix), `architecture` (a structural truth), `glossary` (a term), `task` (work state).
- *Title is the claim, not the topic*: "SSE tests must subscribe before the handshake", not "SSE testing". Body: context → what → why → consequence, ≤200 words. `confidence` honest, `scope` set to the area it governs.
- *Never capture*: secrets, raw file dumps, transient chatter.

**4. `project-onboarding`** (setup; tools: `list_sources`, `add_source`, `scan_source`, `get_stats`, `search`, `compile_context`, `capture_memory`)
- *Goal*: a new repository answerable in one pass.
- *Do*: `list_sources` (already registered?) → `add_source {kind:'filesystem'|'git', root:'<absolute path>', label?}` → `scan_source {id}` (incremental and idempotent — re-running is safe) → `get_stats` to confirm documents/graph nodes are non-zero → smoke-test with `search {query:'<a symbol you know exists>'}` and `compile_context {task:'<the first real task>', budget:2000}`.
- *Then*: `capture_memory {kind:'architecture', ...}` describing what this repository is, so every later compile has an anchor.
- *If stats are zero*: the root is wrong or the scan found nothing — fix the root and rescan.

### C. MCP surface — `list_skills` / `get_skill` (increment 2)

#### C.1 Shapes (`apps/mcp/src/schemas.ts`)

```ts
import { SKILL_CATEGORIES, SKILL_NAMES } from '@tessera/skills';

export const listSkillsShape = {
  category: z.enum(SKILL_CATEGORIES).optional().describe('Restrict to one category.'),
};
export const getSkillShape = {
  name: z.enum(SKILL_NAMES).describe('Skill name, as returned by list_skills.'),
};
```

`z.enum(SKILL_NAMES)` (not `z.string()`) so the tool's JSON Schema *is* the catalog: an agent can call `get_skill` without a prior `list_skills`, and a typo returns a validation error at the boundary instead of a NotFound. Consequence, knowingly taken: adding a skill later changes `generated/mcp-tools.json` and requires a docs regeneration (§F) — the intended honesty coupling.

#### C.2 Registration (`apps/mcp/src/server.ts`)

```ts
server.registerTool('list_skills', {
  description:
    'First-party Tessera skills that teach agents this workflow — name, version, category, and when to use each. Bodies are not included; fetch one with get_skill.',
  inputSchema: listSkillsShape,
}, (args, extra) => runTool(async () => {
  await guard('list_skills', extra);
  const skills = args.category === undefined ? SKILLS : SKILLS.filter((s) => s.category === args.category);
  return { skills: skills.map(toWireSkill) };   // {name, version, category, description, agents}
}));

server.registerTool('get_skill', {
  description:
    "One skill's full SKILL.md document plus where to write it per agent (e.g. .claude/skills/<name>/SKILL.md).",
  inputSchema: getSkillShape,
}, (args, extra) => runTool(async () => {
  await guard('get_skill', extra);
  const manifest = findSkill(args.name);
  const document = getSkillDocument(args.name);
  if (manifest === undefined || document === undefined) throw new NotFoundError(`skill not found: ${args.name}`);
  return { name: manifest.name, version: manifest.version, category: manifest.category,
           description: manifest.description, paths: installPathsFor(manifest.name), document };
}));
```

Token-lean by construction (NFR-4): `list_skills` returns four one-line records and **no bodies** (structurally impossible — the handler imports the root entry, not `./content`); `get_skill` returns exactly one document plus the four install paths an agent needs to write it correctly without a browser. These are the first two tools that wrap **no `ApiServices`** — they serve static first-party content — so they take no tenant/project scoping (`projectOf` is not called).

#### C.3 Gateway (the three exhaustive maps, `apps/mcp/src/gateway.ts`)

- `McpToolName` gains `'list_skills' | 'get_skill'` (18 → **20** tools).
- `TOOL_PERMISSIONS`: **both → `'search:read'`**.
- `MCP_AUDIT_ACTIONS`: **both → `'search'`**.

Argued, because an evaluator will ask. The registry is *public first-party content* — the same bytes the marketing site serves unauthenticated. Minting a `skills:read` permission would ripple the RBAC catalog (`apps/api/src/auth/model.ts` `PERMISSIONS`/`ROLE_PERMISSIONS`) through `GET /v1/rbac` → the OpenAPI document → the generated `@tessera/sdk` → the dashboard's token-scope UI → the docs artifacts (E-003/E-018), for content that no scope protects, and would leave a token scoped to `search:read` unable to read a public document. Reusing the lowest read every role already holds (`search:read` is in `READ_PERMISSIONS`, so `viewer` upward) keeps least privilege honest and adds nothing to the catalog. The audit action mirrors the permission — a catalog discovery read mapped to the discovery action, keeping the permission↔action pairing coherent with every other row. This follows the `get_stats` precedent documented inline in that file ("reuses the existing read action rather than minting a new one … one new vocabulary entry for a read that REST does not record would make the two surfaces disagree for no compliance gain"). Known cost: `search` is in `ACTIVITY_ACTIONS`, so a skills fetch counts as activity in the F-084 chart. Alternatives recorded: `source.read` (quieter, semantically wrong) or a new `skills.read` action (honest, but ripples the audit taxonomy through E-003/E-018/E-020 and the dashboard audit filter for public content).

#### C.4 Cross-check test (`apps/mcp/src/skills.test.ts`, new)

Every tool declared in a skill's `tessera.tools` must be a registered `McpToolName`. This is the guard that keeps skill *content* from drifting away from the tool surface: rename a tool and the skills that teach it fail the gate. `apps/mcp` is the only place that can see both sides.

Also refresh the stale module doc comments in `apps/mcp/src/index.ts` and `server.ts` (both still say "five tools") while editing those files — keeping docs true in files we already touch, not a drive-by refactor.

### D. CLI surface — `tessera skills` (increment 3)

New `apps/cli/src/commands/skills.ts`, appended to `COMMANDS` in `cli.ts` (help renders from the same list). Subcommand dispatch + validation follow `commands/source.ts` / `commands/token.ts` exactly. **No runtime boot**: skills are static data, so every path is fast and unit-testable with `tests/support/capture-io.ts`.

```
Usage: tessera skills list [--category <name>] [--json]
       tessera skills show <name> [--json]
       tessera skills install <name> [--agent <id>] [--global] [--dir <path>] [--force] [--json]

First-party SKILL.md instructions that teach an agent the Tessera workflow (FR-69).
`list` prints the registry; `show` prints one skill's SKILL.md to stdout; `install` writes it
to the agent's skills directory — by default <cwd>/.claude/skills/<name>/SKILL.md (claude-code).
--agent picks another agent, --global writes to the home-directory location instead of the
project one, --dir writes under an explicit root (overriding both), --force replaces an
existing file. Categories: workflow, setup. Agents: claude-code, cursor, cline, codex.
```

- `parseArgs(argv, { booleans: ['json', 'global', 'force'] })` — `--dir ./x` and `--agent cursor` are valued flags, so the boolean spec is what keeps `--json <name>` parsing correctly.
- Default agent is `claude-code`: it is the most widely-read location (Cline explicitly falls back to `.claude/skills/`), and the printed path always states where the file went.
- `install` **validates compatibility**: if the skill's `agents` list does not contain the target, refuse — that is what makes the manifest field load-bearing rather than decorative.
- `install` is **idempotent**: identical bytes on disk → success with `Already installed (identical): <path>` and no write (mirrors the idempotent-scan ethos); differing bytes without `--force` → refuse.
- Human output: `list` uses `renderTable` (`name` → `description`) plus a trailing `Install: tessera skills install <name>` line; `show` writes the raw document (pipeable); `install` prints `Installed <name>@<version> → <path>`.
- `--json` shapes: `{skills:[{name,version,category,description,why,agents}]}` / `{name,version,category,description,document}` / `{name,version,agent,path,written:boolean,reason?:'identical'}`.

Errors — house style (`error: <message>` + `hint: …` on stderr, exit code **1** via `CliError`, the only code this CLI uses):

| condition | message | hint |
|---|---|---|
| no subcommand | `missing subcommand — try 'tessera skills list'` (errline + return 1, as `source`) | — |
| bad subcommand | `unknown skills subcommand 'x'` | `try 'tessera skills list', 'show', or 'install'` |
| missing name | `skills install needs a <name>` | `e.g. tessera skills install compile-before-coding` |
| unknown skill | `unknown skill 'x'` | `known skills: capture-memory, compile-before-coding, effects-before-editing, project-onboarding` |
| unknown agent | `unknown agent 'x'` | `known agents: claude-code, cursor, cline, codex` |
| unknown category | `unknown category 'x'` | `known categories: workflow, setup` |
| incompatible | `skill 'x' does not list agent 'y' as compatible` | `compatible agents: …` |
| file exists | `refusing to overwrite <path>` | `pass --force to replace it` |
| write failed | `could not write <path>` (with `cause`) | `check the directory permissions` |

### E. Marketing surface — `/skills` (increments 5 and 6)

Start from the [`marketing-ui`](../skills/marketing-ui/SKILL.md) skill; the binding authority is [`MARKETING-DESIGN.md`](../../docs/design/MARKETING-DESIGN.md) + its [manifest](../../docs/design/marketing-design.manifest.json) and [`../rules/frontend/marketing.md`](../rules/frontend/marketing.md).

#### E.1 Design-contract change first (increment 5, doc + globals.css)

A catalog with filters is **not** in the §3 archetype inventory, and the closed token set forbids Tailwind arbitrary values (`has-[:checked]` would fail the `arbitrary-bracket-values` banned pattern), so the filter mechanism must be a named device in `app/globals.css`. Per the standing rule ("a new shape = update MARKETING-DESIGN.md + manifest first"; precedent: `legal-prose` landed as manifest v4.10 without its own ADR):

- **MARKETING-DESIGN.md §3.15 `skills-catalog`** (new archetype): filter rail (native radio group, chips) + card grid; each card = name (h3) · category chip · description · why line · links to the detail page and the raw `.md`. Install paths render as a three-item list with commands as inline `<code>` on the `small` token — **never** a terminal window or code-block panel (§3 banned archetypes stand).
- **MARKETING-DESIGN.md §2.3 `.skill-filter`** (new sanctioned device): defined once in `globals.css`, `:has()`-driven, one rule per category, zero JavaScript.
- **manifest → 4.11.0**: add the `skills-catalog` entry to `sections`, the device to `tokens.sanctionedDecoration`, and one new **required** pattern (`skills-filter-device-defined`: `globals.css` must contain `.skill-filter`). No banned pattern is weakened and no `allowIn` is added.

**Why CSS-only instead of a client island:** the house precedent is explicit (the FAQ is native `details/summary`, "never a JS accordion"); `budgets.clientIslands` is a short closed list; and the first-load JS budget is **gate-enforced at 240KB gz with the site currently measuring 225–229KB** (`tests/web-perf/budgets.json`). A radio group + `:has()` costs zero bytes, is natively keyboard-operable, and works before hydration. The cost is one CSS rule per category — bounded by the `SKILL_CATEGORIES` enum and covered by a test that asserts `globals.css` defines a rule for every member. Recorded fallback if review rejects it: a `SkillFilter` client island (buttons + `aria-pressed`, the `ThemeToggle` pattern) added to `budgets.clientIslands` in the same manifest bump.

#### E.2 Pages (increment 6)

- `app/skills/page.tsx` (rewrite): **keep** the `PageHeader` hero and the `SkillLoop` art and the existing h1 statement ("Teach your agents the *workflow*." — `tests/e2e/pages.spec.ts` asserts that fragment); **delete** `PLANNED_SKILLS` and the `registry in development` Badge. Children become a Badge rendering `{SKILLS.length} first-party skills` (a derived fact, not a claim). Then the `skills-catalog` section (filter + cards, all from `@tessera/skills`), then a `steps`-shaped "Three ways to install" section (download / CLI / MCP), then the existing `CtaBand`.
- `app/skills/[skill]/page.tsx` (new): `generateStaticParams()` from `SKILL_NAMES`, `generateMetadata()` (satisfies the `page-exports-metadata` required pattern). `PageHeader` with eyebrow `skill · <name>`, h1 = `headline`, lead = `description`. Sections: **What it does** (description + the tools it uses, as chips linking to the docs MCP reference via `NEXT_PUBLIC_DOCS_URL`), **Why it matters** (`why`), **Install** (per-agent path from `SKILL_TARGETS` + the CLI command + the MCP call), and a link to the raw document.
- `app/skills/[skill]/skill.md/route.ts` (new): the **direct download** on a static-first site — `export const dynamic = 'force-static'` + `generateStaticParams()`, returning `getSkillDocument(name)` as `text/markdown; charset=utf-8`. This is the existing `app/llms.txt/route.ts` pattern (already `force-static`), so the artifact is prerendered at build and `next start` serves a file; nothing runs at request time. URL: `/skills/compile-before-coding/skill.md`, linked with `download` from both pages. *Verification checkpoint*: confirm the route shows as statically prerendered in the `next build` output. **Recorded fallback** if Next refuses to prerender a dynamic route handler: emit the files into `public/skills/<name>/SKILL.md` from a `prebuild` script and drift-test them.
- `app/sitemap.ts`: add the four detail pages (mapped from `SKILLS`, not hand-listed).
- `app/llms.txt/route.ts`: drop "(in development)" from the Skills line, list the detail pages, and add `list_skills, get_skill` to the MCP tools line.
- `lib/skills.ts` (new): the display model — `skillDisplays()`, `skillDisplay(name)`, `categoryFilters()` (id, label derived by capitalizing the id, count), `installPaths(name)`. Exactly the `lib/pricing.ts` role: **nothing is hand-copied; the page renders what the registry says.**
- `app/globals.css`: the `.skill-filter` device (visually-hidden radios, chip labels via `input:checked + span`, a visible `:focus-visible` ring, one `:has()` rule per category).
- `components/skills/skill-card.tsx`, `components/skills/skill-filter.tsx`: server components, tokens only, closed type scale.
- `package.json`: `+ "@tessera/skills": "workspace:*"`.

### F. Docs regeneration — required in-change work (inside increments 2 and 3)

E-026 makes this an obligation, not an option: `apps/docs/generated/mcp-tools.json` is derived from the **real built `tessera-mcp` binary**'s `tools/list` and `generated/cli-reference.json` from the CLI's `COMMANDS`. Both change here, and `apps/docs/tests/generated-drift.test.ts` byte-compares in the standard `test` gate.

**Sequencing matters:** run `pnpm --filter @tessera/docs generate` and commit the artifacts **in the same increment** that changes their input — otherwise `pnpm -w test` is red between commits, violating "keep the build green at every step". So: increment 2 ends with a regeneration (tool count 18 → 20), increment 3 ends with another (the `skills` command row). The generator imports the *built* CLI and spawns the *built* server bin, so `pnpm -w build` must run first (turbo's `^build` ordering does this for the gates). The docs e2e (`the MCP reference lists every tool the server reports`) and `link-check` derive from the artifacts, so they follow automatically.

### G. Increment sequence (each independently verifiable, tree green throughout)

1. **`packages/skills`** — registry sources, types, generator, generated modules, tests. No consumer yet. Gates: state/typecheck/lint/format/test/build.
2. **MCP tools** — schemas, registration, the three gateway maps, unit + e2e (including the scripted agent session), **plus the docs regeneration**.
3. **CLI `skills`** — command, registration, unit tests, **plus the docs regeneration**.
4. *(no standalone docs commit — folded into 2 and 3, see §F)*
5. **Marketing design contract + device** — MARKETING-DESIGN.md §3.15/§2.3, manifest 4.11.0, the new required pattern, and the `globals.css` `.skill-filter` block in the **same** commit (a required pattern that lands before its CSS would be a red intermediate).
6. **Marketing `/skills`** — catalog, detail, download route, sitemap, llms.txt, tests, e2e, screenshot review + design-review pass.
7. **Effects + state** — `effects.json` (E-003/E-004/E-026 extended, E-027 added), `feature_list.json` (status + notes clearing the placeholder debt), `progress.md`, memory lesson if one is worth keeping.

## Files to touch

**New — `packages/skills`**
- `packages/skills/package.json` — `@tessera/skills`, `type: module`, `exports` `.` + `./content`, `files: ["dist"]`, scripts `build/typecheck/lint/test/generate`, devDeps `yaml` + `zod`.
- `packages/skills/tsconfig.json` — mirrors `packages/billing`.
- `packages/skills/registry/{compile-before-coding,effects-before-editing,capture-memory,project-onboarding}/SKILL.md` — the four skills (§B).
- `packages/skills/scripts/generate.mjs` — parse + validate + emit; exports `generate()`.
- `packages/skills/src/types.ts`, `src/index.ts`, `src/content.ts`, `src/generated/catalog.ts`, `src/generated/documents.ts`.
- `packages/skills/tests/registry.test.ts` — the CI validation + drift suite (§A.5).

**`apps/mcp`**
- `src/schemas.ts` — `listSkillsShape`, `getSkillShape`.
- `src/server.ts` — register both tools; `toWireSkill` + `installPathsFor` helpers; refresh the stale "five tools" doc comment.
- `src/gateway.ts` — `McpToolName` + `TOOL_PERMISSIONS` + `MCP_AUDIT_ACTIONS` (all three, with the reuse rationale as an inline comment in the `get_stats` house style).
- `src/gateway.test.ts` — the sorted tool-name expectation (18 → 20).
- `src/skills.test.ts` (new) — declared tools ⊆ `McpToolName`.
- `tests/e2e/mcp.e2e.test.ts` — the advertised tool set (18 → 20).
- `tests/e2e/skills.e2e.test.ts` (new) — the scripted agent session (§Test plan).
- `src/index.ts` — export the two shapes alongside the others; fix the stale doc comment.
- `package.json` — `+ @tessera/skills`.

**`apps/cli`**
- `src/commands/skills.ts` (new), `src/cli.ts` (register in `COMMANDS`), `src/commands/skills.test.ts` (new), `src/commands/subcommands.test.ts` (dispatch/validation rows), `package.json` (`+ @tessera/skills`).

**`apps/docs`** — regenerated only, never hand-edited: `generated/mcp-tools.json`, `generated/cli-reference.json`.

**`apps/marketing`** — `app/skills/page.tsx`, `app/skills/[skill]/page.tsx`, `app/skills/[skill]/skill.md/route.ts`, `app/sitemap.ts`, `app/llms.txt/route.ts`, `app/globals.css`, `lib/skills.ts`, `components/skills/skill-card.tsx`, `components/skills/skill-filter.tsx`, `tests/skills-content.test.ts`, `tests/e2e/pages.spec.ts`, `tests/e2e/skills.spec.ts`, `package.json`, and the "Relevant features" line in `apps/marketing/AGENTS.md`.

**Design contract** — `docs/design/MARKETING-DESIGN.md`, `docs/design/marketing-design.manifest.json`.

**Harness state** — `.harness/state/effects.json`, `.harness/state/feature_list.json`, `.harness/state/progress.md` (+ `.harness/memory/` and its index if a lesson lands).

No new `TESSERA_*` env vars, so `.env.example` is untouched (the `state` gate's env-docs guard has nothing to check here).

## Anticipated effects

Run the [effect-link protocol](../protocols/effect-link.md) before finishing; the specific dependents are known now:

- **E-003 (REST `/v1` + MCP tool contracts)** — extend: two new MCP tools (`list_skills`, `get_skill`) that wrap **no `ApiServices`** (a first: static first-party content, no tenant/project scoping); `McpToolName`, `TOOL_PERMISSIONS`, `MCP_AUDIT_ACTIONS` are exhaustive `Record`s and all three change together; the tool count assertion in `apps/mcp/src/gateway.test.ts` and the advertised-set assertion in `tests/e2e/mcp.e2e.test.ts` are dependents. **No REST route and no SDK/OpenAPI regeneration** — the REST surface is untouched (state this in the effect note so a future reader does not go looking).
- **E-026 (docs generated-reference inputs)** — extend: `generated/mcp-tools.json` (`toolCount` 18 → 20 + two entries) and `generated/cli-reference.json` (a `skills` row) must be regenerated and committed *in the same increment*; `tests/generated-drift.test.ts`, `tests/link-check.test.ts` (tool/command names become anchors) and `tests/e2e/docs.spec.ts` all derive from those artifacts.
- **E-004 (design tokens → marketing/web components)** — extend: manifest 4.11.0 adds the `skills-catalog` archetype, the `.skill-filter` sanctioned device, and one required pattern; `apps/marketing/tests/design-lint.test.ts` compiles the manifest, so the doc and the manifest move together.
- **E-027 (new): the skills registry → its three surfaces.** From: `@tessera/skills` (the `registry/*/SKILL.md` sources + the generated catalog/documents + `SKILL_TARGETS`). To: `apps/marketing` (`/skills`, `/skills/<name>`, `/skills/<name>/skill.md`, `sitemap.ts`, `llms.txt`), `apps/cli` (`tessera skills`), `apps/mcp` (`list_skills`/`get_skill` + the `z.enum(SKILL_NAMES)` baked into `generated/mcp-tools.json`), and the tests that hold it together (`packages/skills/tests/registry.test.ts` drift + validation, `apps/mcp/src/skills.test.ts` tool-name cross-check, `apps/marketing/tests/skills-content.test.ts` no-hand-copy scan). Rationale to record: editing a SKILL.md requires `pnpm --filter @tessera/skills generate`; **renaming or adding a skill additionally** changes the marketing static params + sitemap, the MCP input enum, and therefore the docs artifacts.

## Test plan

**Unit — `packages/skills`** (`tests/registry.test.ts`): the eight assertions in §A.5 (discovery, spec conformance, Tessera metadata, uniqueness, frontmatter/manifest agreement, body honesty, byte-identical drift, parser rejection cases).

**Unit — `apps/mcp`**: `gateway.test.ts` sorted-name expectations for `TOOL_PERMISSIONS` and `MCP_AUDIT_ACTIONS` (20 entries, still equal key sets); `skills.test.ts` — every tool a skill declares is a real `McpToolName`.

**Unit — `apps/cli`** (`src/commands/skills.test.ts` + rows in `subcommands.test.ts`): missing and unknown subcommands; unknown skill / agent / category messages and hints; `list --json` and `list --category` shapes; `show` writes the exact document; `install --dir <tmp>` writes `<tmp>/<name>/SKILL.md` byte-identical to `getSkillDocument`; a second install is a no-op success; a modified file refuses without `--force` and is replaced with it; an incompatible `--agent` is refused. Temp dirs via `mkdtemp`; no runtime boot anywhere.

**Unit — `apps/marketing`** (`tests/skills-content.test.ts`, the `tests/pricing.test.ts` pattern): `skillDisplays()` projects every registry skill in stable order; the page sources contain **none** of the registry's descriptions / why / headline strings (scan `app/skills/page.tsx` and `app/skills/[skill]/page.tsx`); `globals.css` defines a `:has()` rule for every `SKILL_CATEGORIES` member; `installPaths()` derives from `SKILL_TARGETS`.

**Integration / e2e — MCP, "tested against a real agent session"** (`apps/mcp/tests/e2e/skills.e2e.test.ts`, a real `Client` over `InMemoryTransport` against `buildMcpServer(createInMemoryServices())` — the established pattern): the acceptance clause is satisfied by the **scripted** branch, deterministically:
1. `list_skills` returns all four manifests, **contains no `document` field**, and its serialized payload stays under a stated size ceiling (the NFR-4 assertion made executable).
2. `list_skills {category:'setup'}` filters.
3. `get_skill {name:'project-onboarding'}` returns a document **byte-identical** to `getSkillDocument('project-onboarding')` plus the four install paths.
4. **The fetched skill is then executed**: the agent runs exactly the calls that skill prescribes — `list_sources` → `add_source` → `scan_source` → `get_stats` → `search` → `compile_context` — and each succeeds. Likewise `compile_context {task,budget}` for `compile-before-coding`, `get_effects` + `assert_effect` for `effects-before-editing`, and `capture_memory` with a kind from that skill's list. A skill that names a tool that does not exist, or arguments that do not validate, fails this gate.
5. A gateway-guarded call without `search:read` is `FORBIDDEN`; with it, allowed.

**E2E — marketing** (`tests/e2e/skills.spec.ts` + the shared battery in `tests/e2e/pages.spec.ts`):
- add `/skills/compile-before-coding` (and iterate `SKILLS` for the rest) into the `PAGES` battery: exactly one `h1`, **axe WCAG 2.1 AA zero violations on both themes**, no horizontal overflow at 375px, listed in `sitemap.xml` and `llms.txt`.
- the catalog lists every skill in `SKILLS` (imported in the spec — no hand-written list).
- **the filter works with JavaScript disabled** (`test.use({ javaScriptEnabled: false })`): select `setup` → only the setup skill remains visible; select `all` → all four return.
- `GET /skills/<name>/skill.md` returns 200, `text/markdown`, and a body byte-identical to `getSkillDocument(name)` — the anti-hand-copy proof and the download path in one assertion.
- keyboard: the filter radios are reachable and operable by arrow keys with a visible focus ring.

**E2E — docs**: unchanged code, but `tests/e2e/docs.spec.ts` and `link-check` must stay green against the regenerated artifacts (they iterate `mcp-tools.json`, so they pick up the two tools).

## Verification

Gates from [`../verification/gates.json`](../verification/gates.json), in order, per the [verification protocol](../protocols/verification.md) — run the full set at the end of every increment that touches code:

```
node scripts/verify-state.mjs
pnpm -w typecheck
pnpm -w lint
pnpm -w format:check
pnpm -w test
pnpm -w build
pnpm -w test:e2e
pnpm -w test:perf          # marketing first-load budget (requires build first)
```

Targeted commands used inside increments:

```
pnpm --filter @tessera/skills generate     # then commit src/generated/*
pnpm --filter @tessera/skills test
pnpm --filter @tessera/mcp test
pnpm --filter @tessera/mcp test:e2e
pnpm --filter @tessera/cli test
pnpm --filter @tessera/docs generate       # then commit generated/*  (after pnpm -w build)
pnpm --filter @tessera/marketing test      # design-lint lives here
pnpm --filter @tessera/marketing test:e2e  # axe AA
```

Plus, because a marketing screen changed, the [MARKETING-DESIGN §8 review protocol](../../docs/design/MARKETING-DESIGN.md) is part of done: **screenshot review** at 1440x900, 1280x800 and 375x812, full-page, reduced-motion, **both themes**, for `/skills` and one detail page, ending with the brand-swap test; then a `design-review` pass. "It renders" is not "it's right."

**Evidence to capture** in [`../state/progress.md`](../state/progress.md): each gate command and its result; the regenerated `toolCount` going 18 → 20; the `next build` output line proving `/skills/[skill]/skill.md` is statically prerendered; the measured marketing first-load KB against the 240KB budget; axe zero-violation counts for both themes; the screenshot review verdict. Per the [definition of done](../protocols/definition-of-done.md), none of this is optional.

## Risks / open questions

**Does F-054 need its own ADR? No — it is covered by [ADR-0036](../../docs/adr/0036-agent-first-operations.md).** That ADR decides the registry itself, the SKILL.md format ("adopt the emerging convention agents already load; zero new protocol" — the custom-format alternative was explicitly rejected), the three install paths, and the `/skills` browsing surface. Everything this plan adds is implementation inside that decision. Two things still need *recorded* decisions, but at the level the harness already delegates them to:

- the marketing design-contract change → `MARKETING-DESIGN.md` + manifest bumped **together** (the mechanism ADR-0042/0043 established; precedent: the `legal-prose` archetype shipped as manifest v4.10 with no new ADR);
- the RBAC/audit mapping → an inline documented decision in `gateway.ts` (the `get_stats` precedent).

**The one ADR escalation trigger:** if review rejects reusing `search:read` and wants a dedicated `skills:read` permission, that changes the RBAC catalog and ripples through `/v1/rbac` → OpenAPI → `@tessera/sdk` → the dashboard token UI → the docs artifacts. That is a documented-default deviation and **must not be coded before an ADR exists**.

Open questions and risks, each with its resolution point:

- **OQ-1 — static prerender of a dynamic route handler.** `app/skills/[skill]/skill.md/route.ts` relies on `dynamic = 'force-static'` + `generateStaticParams()` prerendering under Next 16. *Resolve at increment 6* by reading the `next build` route table. Recorded fallback: emit into `public/skills/<name>/SKILL.md` from a `prebuild` script plus a drift test.
- **OQ-2 — the CSS-only filter.** Depends on `:has()` (broadly available, and the e2e proves it in the shipped browser) and needs one rule per category. Recorded fallback: a `SkillFilter` client island added to `budgets.clientIslands` in the same manifest bump — at the cost of first-load JS against a gate-enforced 240KB budget currently measuring ~225–229KB.
- **OQ-3 — baking skill names into `z.enum(SKILL_NAMES)`.** Every future registry addition changes `apps/docs/generated/mcp-tools.json` and needs a regeneration. Accepted deliberately: the churn *is* the honesty mechanism, and it makes the tool schema self-documenting for agents.
- **OQ-4 — publishing.** `@tessera/skills` must be added to the F-059 publish set, since the published CLI will import it at runtime. Tracked as a note on F-059, not built here.
- **OQ-5 — Continue is absent from `SKILL_TARGETS`** although it is a row in `MCP_CLIENTS`. Its skills directory is not something we can state honestly today, and the honesty rule beats symmetry. Adding it later is one row.
- **OQ-6 — generated-artifact ordering.** Two generators now exist in the chain (`@tessera/skills` → `@tessera/mcp`/`@tessera/cli` → `@tessera/docs`). A skill edit that is not followed by *both* regenerations reddens two different drift gates. Mitigation: state the obligation in the E-027 rationale and in the package's module doc comments, exactly as E-026 does today.
- **Risk — cross-platform bytes.** `.gitattributes` sets `eol=lf` globally, but the generator must still normalize CRLF→LF when reading, or a Windows working tree could produce generated content that differs from CI's and fail the drift test for a reason unrelated to the change.
- **Risk — scope pressure on the marketing page.** Rendering skill bodies, adding search, or building a "submit your skill" path are all adjacent and all out of scope; the acceptance list is what ships.
