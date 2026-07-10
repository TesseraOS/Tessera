import type { Metadata } from 'next';
import { SkillLoop } from '@/components/art/skill-loop';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

export const metadata: Metadata = {
  title: 'Agent skills',
  description:
    'First-party skills that teach any agent the Tessera workflow — compile before coding, check effects before editing, capture memory after work. In development.',
  alternates: { canonical: '/skills' },
};

/**
 * Placeholder until the skills registry ships (F-054) — the four planned first-party
 * skills, honestly labeled as planned (§1.5: nothing presented as available before it is).
 */
const PLANNED_SKILLS = [
  {
    name: 'compile-before-coding',
    body: 'Pull a compiled, cited context package instead of reading whole files into the window.',
  },
  {
    name: 'effects-before-editing',
    body: 'Call get_effects before touching a symbol — know the blast radius before the diff exists.',
  },
  {
    name: 'capture-memory',
    body: 'Record decisions and lessons back to Tessera when the work lands, so the next session starts warm.',
  },
  {
    name: 'project-onboarding',
    body: 'Bootstrap a new repository into Tessera: register sources, scan, and run the first compile.',
  },
] as const;

export default function SkillsPage() {
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
          lead="Skills are small, versioned instructions any agent can follow. The first-party set teaches the Tessera loop; the registry that serves them is in development."
          art={<SkillLoop />}
        >
          <Badge>registry in development</Badge>
        </PageHeader>

        <section
          id="planned"
          aria-labelledby="planned-title"
          className="scroll-mt-16 py-24 md:py-32"
        >
          <Container>
            <Reveal>
              <SectionHeading
                id="planned-title"
                title="The first-party set"
                lead="Four skills, one discipline: context in, effects checked, memory out."
              />
            </Reveal>
            <ul className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2 md:gap-6">
              {PLANNED_SKILLS.map((skill, index) => (
                <li key={skill.name} className="h-full">
                  <Reveal
                    delay={(index % 2) * 90}
                    className="bg-card shadow-soft h-full rounded-lg border p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-label text-foreground">{skill.name}</h3>
                      <Badge>planned</Badge>
                    </div>
                    <p className="text-body text-muted-foreground mt-4">{skill.body}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
            <Reveal delay={120}>
              <p className="text-small text-faint-foreground mt-8 max-w-xl">
                When the registry ships, each skill installs by download, by CLI, or straight over
                MCP — and this page becomes the catalog.
              </p>
            </Reveal>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
