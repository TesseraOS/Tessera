import { describe, expect, it } from 'vitest';
import { SKILLS } from '@tessera/skills';
import { TOOL_PERMISSIONS } from './gateway.js';

/**
 * THE CONTENT/SURFACE CROSS-CHECK (F-054).
 *
 * `packages/skills` validates that a skill's `tessera.tools` appear in its own body — it cannot go
 * further, because the registry must not depend on the MCP server. This is the other half, and it
 * only exists here: a skill may only teach tools this server actually registers. Rename or remove a
 * tool and the skills that teach it fail immediately, instead of shipping instructions that tell an
 * agent to call something that no longer answers.
 */
describe('first-party skills teach the real tool surface', () => {
  const toolNames = new Set(Object.keys(TOOL_PERMISSIONS));

  it.each(SKILLS.map((skill) => [skill.name, skill.tools] as const))(
    '%s only names registered MCP tools',
    (name, tools) => {
      const unknown = tools.filter((tool) => !toolNames.has(tool));
      expect(unknown, `${name} teaches tool(s) this server does not register`).toEqual([]);
    },
  );

  it('covers the skills tools themselves', () => {
    // Guards the guard: if these ever leave the catalog, the assertion above would silently pass
    // against a smaller surface.
    expect(toolNames.has('list_skills')).toBe(true);
    expect(toolNames.has('get_skill')).toBe(true);
  });
});
