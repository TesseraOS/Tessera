/**
 * `@tessera/skills/content` — the SKILL.md bodies, deliberately behind a SECOND entry point.
 *
 * Only the three code paths that genuinely write or serve a document import this: `get_skill`
 * (MCP), `tessera skills show|install` (CLI), and the marketing site's raw-download route. A
 * listing surface importing the root entry therefore CANNOT accidentally ship bodies — NFR-4 is
 * enforced by the module graph instead of by review.
 */
export { SKILL_DOCUMENTS } from './generated/documents.js';

import { SKILL_DOCUMENTS } from './generated/documents.js';

/**
 * The exact `SKILL.md` bytes for `name`, or `undefined` when no such skill exists.
 *
 * `Object.hasOwn` is load-bearing: `name` arrives from an MCP argument, a CLI token, or a URL
 * segment, and a bare index would happily return `Object.prototype.toString` for `"toString"`.
 */
export function getSkillDocument(name: string): string | undefined {
  return Object.hasOwn(SKILL_DOCUMENTS, name) ? SKILL_DOCUMENTS[name] : undefined;
}
