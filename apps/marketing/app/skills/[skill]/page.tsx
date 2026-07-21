import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SKILL_NAMES } from '@tessera/skills';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Panel } from '@/components/ui/panel';
import { SectionHeading } from '@/components/ui/section-heading';
import { TextLink } from '@/components/ui/text-link';
import { Reveal } from '@/lib/motion';
import { installLocations, skillDisplay } from '@/lib/skills';

interface PageProps {
  params: Promise<{ skill: string }>;
}

/** Static params from the registry — a new skill gets a page without touching this file. */
export function generateStaticParams(): { skill: string }[] {
  return SKILL_NAMES.map((skill) => ({ skill }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { skill: name } = await props.params;
  const skill = skillDisplay(name);
  if (skill === undefined) return {};
  return {
    title: `${skill.name} — agent skill`,
    description: skill.description,
    alternates: { canonical: skill.href },
  };
}

export default async function SkillDetailPage(props: PageProps) {
  const { skill: name } = await props.params;
  const skill = skillDisplay(name);
  if (skill === undefined) notFound();

  const locations = installLocations(skill.name);

  return (
    <>
      <SiteNav />
      <main>
        <PageHeader eyebrow={`skill · ${skill.category}`} title={skill.headline} lead={skill.why}>
          <Badge>v{skill.version}</Badge>
          <ButtonLink href={skill.downloadHref} variant="primary" download>
            Download SKILL.md
          </ButtonLink>
          <TextLink href="/skills">All skills</TextLink>
        </PageHeader>

        <section
          id="what-it-does"
          aria-labelledby="what-it-does-title"
          className="scroll-mt-16 py-24 md:py-32"
        >
          <Container>
            <div className="grid gap-12 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-7">
                <Reveal>
                  <SectionHeading id="what-it-does-title" title="What it does" />
                </Reveal>
                <Reveal delay={90}>
                  <p className="text-lead text-muted-foreground mt-6 max-w-xl">
                    {skill.description}
                  </p>
                  <p className="text-body text-faint-foreground mt-6 max-w-xl">
                    {skill.compatibility}
                  </p>
                </Reveal>
              </div>
              <div className="md:col-span-5">
                <Reveal delay={120}>
                  <Panel className="p-7">
                    <h3 className="text-label text-foreground uppercase">Tools it uses</h3>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {skill.tools.map((tool) => (
                        <li key={tool}>
                          <Badge>{tool}</Badge>
                        </li>
                      ))}
                    </ul>
                    <p className="text-small text-muted-foreground mt-6">
                      Every one is a live Tessera MCP tool — the instructions are gated against the
                      real surface, so they cannot drift.
                    </p>
                  </Panel>
                </Reveal>
              </div>
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
                title="Install it"
                lead="Pick the way that suits your agent. Every path writes the same file."
              />
            </Reveal>

            <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2 md:gap-6">
              <Reveal className="h-full">
                <Panel className="flex h-full flex-col p-7">
                  <h3 className="text-label text-foreground uppercase">From the CLI</h3>
                  <p className="text-body text-muted-foreground mt-4 flex-1">
                    Writes the file where your agent looks, and leaves it alone if it is already
                    there.
                  </p>
                  <p className="text-small text-foreground mt-5 border-t pt-4">
                    <code>{skill.installCommand}</code>
                  </p>
                </Panel>
              </Reveal>
              <Reveal delay={90} className="h-full">
                <Panel className="flex h-full flex-col p-7">
                  <h3 className="text-label text-foreground uppercase">Over MCP</h3>
                  <p className="text-body text-muted-foreground mt-4 flex-1">
                    A connected agent fetches the document and the path to write it to, without a
                    browser.
                  </p>
                  <p className="text-small text-foreground mt-5 border-t pt-4">
                    <code>get_skill {`{ "name": "${skill.name}" }`}</code>
                  </p>
                </Panel>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <h3 className="text-label text-foreground mt-12 uppercase">Where it goes</h3>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-lg border-collapse text-left">
                  <caption className="text-small text-faint-foreground mb-3 text-left">
                    Downloading? Save the file to the path your agent reads.
                  </caption>
                  <thead>
                    <tr className="text-label text-faint-foreground">
                      <th scope="col" className="border-b py-3 pr-6 font-normal">
                        Agent
                      </th>
                      <th scope="col" className="border-b py-3 pr-6 font-normal">
                        Project
                      </th>
                      <th scope="col" className="border-b py-3 font-normal">
                        Personal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((location) => (
                      <tr key={location.target} className="text-small">
                        <th
                          scope="row"
                          className="text-foreground border-b py-3 pr-6 text-left font-normal"
                        >
                          {location.label}
                        </th>
                        <td className="text-muted-foreground border-b py-3 pr-6">
                          <code>{location.project}</code>
                        </td>
                        <td className="text-muted-foreground border-b py-3">
                          <code>{location.home}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
