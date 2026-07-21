import { SKILL_NAMES } from '@tessera/skills';
import { getSkillDocument } from '@tessera/skills/content';

/**
 * The raw SKILL.md — the **download** install path (ADR-0036 §3), served as a real file at
 * `/skills/<name>/skill.md`.
 *
 * `force-static` + `generateStaticParams` prerenders one file per skill at build time, so
 * the static-first rule holds (ADR-0035 / NFR-17): nothing runs at request time and the
 * site still needs no server. Same shape as `app/llms.txt/route.ts`.
 *
 * The bytes come from the registry, so this file, `tessera skills install`, and the MCP
 * `get_skill` tool cannot serve three different documents.
 */
export const dynamic = 'force-static';

export function generateStaticParams(): { skill: string }[] {
  return SKILL_NAMES.map((skill) => ({ skill }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ skill: string }> },
): Promise<Response> {
  const { skill } = await context.params;
  const document = getSkillDocument(skill);
  if (document === undefined) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(document, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // Named so a browser "save link as" lands the file with the name agents expect.
      'content-disposition': `inline; filename="SKILL.md"`,
    },
  });
}
