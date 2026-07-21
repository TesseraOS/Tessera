import type { Metadata } from 'next';
import { SkillLoop } from '@/components/art/skill-loop';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { SkillCard } from '@/components/skills/skill-card';
import { SkillFilter } from '@/components/skills/skill-filter';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { Panel } from '@/components/ui/panel';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';
import { SKILL_TARGETS } from '@tessera/skills';
import { categoryFilters, skillDisplays, type SkillDisplay } from '@/lib/skills';

export const metadata: Metadata = {
  title: 'Agent skills',
  description:
    'First-party skills that teach any agent the Tessera workflow — compile before coding, check effects before editing, capture memory after work. Install by download, CLI, or MCP.',
  alternates: { canonical: '/skills' },
};

/**
 * The three install paths (ADR-0036 §3). Commands render as inline code, never a terminal.
 *
 * Built from the registry rather than written out: the example command and the directory list
 * would otherwise go stale the moment a skill is renamed or a target added, and a bare-substring
 * scan in tests/skills-content.test.ts now fails on either.
 */
function installPaths(example: SkillDisplay) {
  return [
    {
      title: 'Download',
      body: `Take the raw SKILL.md and drop it into your agent’s skills directory — ${SKILL_TARGETS.slice(
        0,
        2,
      )
        .map((target) => target.projectDir)
        .join(', ')}, or your agent’s own.`,
      command: null,
    },
    {
      title: 'CLI',
      body: 'Writes the file where your agent will find it, and does nothing if it is already there.',
      command: example.installCommand,
    },
    {
      title: 'MCP',
      body: 'A connected agent fetches skills itself — no browser, no copy-paste. get_skill returns the document and the path to write it to.',
      command: 'list_skills · get_skill',
    },
  ] as const;
}

export default function SkillsPage() {
  const skills = skillDisplays();
  const filters = categoryFilters();
  // The catalog is never empty (the registry gate asserts it), so the first skill is the example.
  const paths = skills[0] === undefined ? [] : installPaths(skills[0]);

  return (
    <>
      <SiteNav />
      <main>
        <PageHeader
          eyebrow="skills"
          title={
            <>
              Teach your agents the <em className="text-rose">workflow</em>.
            </>
          }
          lead="Skills are small, versioned instructions any agent can follow. The first-party set teaches the Tessera loop: context in, effects checked, memory out."
          art={<SkillLoop />}
        >
          <Badge>
            {skills.length} first-party {skills.length === 1 ? 'skill' : 'skills'}
          </Badge>
        </PageHeader>

        <section
          id="catalog"
          aria-labelledby="catalog-title"
          className="scroll-mt-16 py-24 md:py-32"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="catalog-title"
                title="The first-party set"
                lead="One discipline, in four instructions an agent can load on demand."
              />
            </Reveal>
            <div className="skill-filter mt-12 md:mt-16">
              <Reveal>
                <SkillFilter filters={filters} />
              </Reveal>
              <ul className="mt-8 grid gap-5 md:gap-6 lg:grid-cols-2">
                {skills.map((skill, index) => (
                  <li key={skill.name} data-skill-category={skill.category} className="h-full">
                    <Reveal delay={(index % 2) * 90} className="h-full">
                      <SkillCard skill={skill} />
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>

        <section
          id="install"
          aria-labelledby="install-title"
          data-band="chapter"
          className="bg-background text-foreground scroll-mt-16 py-24 md:py-32"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="install-title"
                title="Three ways to install"
                lead="Same file every way in — the registry is one source, and every surface serves it byte for byte."
              />
            </Reveal>
            <ul className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
              {paths.map((path, index) => (
                <li key={path.title} className="h-full">
                  <Reveal delay={index * 90} className="h-full">
                    <Panel className="flex h-full flex-col p-7">
                      <h3 className="text-label text-foreground uppercase">{path.title}</h3>
                      <p className="text-body text-muted-foreground mt-4 flex-1">{path.body}</p>
                      {path.command ? (
                        <p className="text-small text-faint-foreground mt-5 border-t pt-4">
                          <code>{path.command}</code>
                        </p>
                      ) : null}
                    </Panel>
                  </Reveal>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
