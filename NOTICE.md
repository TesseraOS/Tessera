# NOTICE — third-party attributions

Tessera includes material adapted from third-party open-source projects. Attributions and
their license terms are listed here.

## ECC — "Everything Claude Code"

Portions of Tessera's **agent harness** — specifically the general-purpose execution skills
[`strategic-compact`](.harness/skills/strategic-compact/SKILL.md),
[`continuous-learning`](.harness/skills/continuous-learning/SKILL.md), and
[`coding-standards`](.harness/skills/coding-standards/SKILL.md) — are **adapted** (not copied
verbatim) from **ECC (Everything Claude Code)**.

- **Source:** <https://github.com/affaan-m/ECC>
- **Copyright:** © 2026 Affaan Mustafa
- **License:** MIT

See [ADR-0013](docs/adr/0013-general-purpose-execution-skills-from-ecc.md) for the adoption
decision. ECC is also Tessera's standing reference for coding-related harness patterns.

### MIT License (ECC)

```
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Frontend design skills

Portions of Tessera's **frontend harness** — the skills
[`shadcn`](.harness/skills/shadcn/SKILL.md),
[`frontend-craft`](.harness/skills/frontend-craft/SKILL.md), and
[`motion`](.harness/skills/motion/SKILL.md) — are **adapted** (ideas/principles, not copied
verbatim) from the open-source skills below, and are used **subordinate to**
[`docs/design/DESIGN-SYSTEM.md`](docs/design/DESIGN-SYSTEM.md). See
[ADR-0021](docs/adr/0021-frontend-harness-and-design-skill-adaptation.md) for the adoption
decision.

| Adapted into | Source | Author / © | License |
|---|---|---|---|
| `shadcn` | [shadcn/ui skill](https://ui.shadcn.com/docs/skills) | shadcn | MIT |
| `frontend-craft` | [anthropics/skills — `frontend-design`](https://github.com/anthropics/skills) | Anthropic | Apache-2.0 |
| `frontend-craft` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | © 2026 Leonxlnx | MIT |
| `motion` | [emilkowalski/skill](https://github.com/emilkowalski/skill) | Emil Kowalski | MIT |

These are adaptations of ideas grounded in our own DESIGN-SYSTEM.md, not redistributions of the
original files. The upstream license texts (MIT / Apache-2.0) apply to their respective sources.

## Design-review skill (`impeccable`)

Tessera's [`design-review`](.harness/skills/design-review/SKILL.md) skill **adapts** the
audit/critique workflow and deterministic anti-pattern detectors of **impeccable** (ideas and
review discipline, not copied files), used **subordinate to**
[`DESIGN-SYSTEM.md`](docs/design/DESIGN-SYSTEM.md). impeccable also informs the typography/motion
lineage credited in `frontend-craft` above. See
[ADR-0038](docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md).

- **Source:** <https://github.com/pbakaus/impeccable>
- **Author / ©:** pbakaus
- **License:** Apache-2.0

## Skill-observer skill (One Skill to Rule Them All / Task Observer)

Tessera's [`skill-observer`](.harness/skills/skill-observer/SKILL.md) skill **adapts** the
session-observer methodology of **"One Skill to Rule Them All" (Task Observer)** — capture
Issue / Suggested-improvement / Principle observations, review periodically, improve the skill
library — adapted to write into the in-repo system of record. See
[ADR-0038](docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md).

- **Source:** <https://github.com/rebelytics/one-skill-to-rule-them-all>
- **Author / ©:** Eoghan Henn (rebelytics.com)
- **License:** Creative Commons Attribution 4.0 International (**CC BY 4.0**) — attribution is
  required by the license and is retained here.

## Codex adversarial review (optional adapter integration)

Tessera's optional, opt-in Claude Code integration
[`.claude/integrations/codex-adversarial-review.md`](.claude/integrations/codex-adversarial-review.md)
documents use of **openai/codex-plugin-cc** as an independent-model reviewer. We reference and
invoke the upstream plugin (no files copied). It is disabled by default; see
[ADR-0039](docs/adr/0039-optional-independent-model-adversarial-review-codex.md) and the
[`third-party-model-review`](.harness/governance/third-party-model-review.md) policy.

- **Source:** <https://github.com/openai/codex-plugin-cc>
- **Author / ©:** OpenAI
- **License:** Apache-2.0
