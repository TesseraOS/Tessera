import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

/** Deployment-agnostic story (ADR-0003): local, self-hosted, cloud — all true today. */
const MODES = [
  {
    name: 'local',
    body: 'One process on your machine. SQLite and local embeddings — no keys, no egress.',
  },
  {
    name: 'self-hosted',
    body: 'Docker Compose with Postgres + pgvector. Your infrastructure, your rules.',
  },
  {
    name: 'cloud',
    body: 'Managed and multi-tenant, with RBAC, quotas, and the audit trail built in.',
  },
] as const;

export function DeployBand() {
  return (
    <section
      id="deploy"
      aria-labelledby="deploy-title"
      className="bg-surface/60 scroll-mt-16 border-t"
    >
      <Container className="py-24 md:py-32">
        <Reveal>
          <SectionHeading
            id="deploy-title"
            title="Runs where your code runs"
            lead="The same engine across every profile — switch by configuration, not migration."
          />
        </Reveal>
        <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
          {MODES.map((mode, index) => (
            <Reveal key={mode.name} delay={index * 90} className="border-t pt-5">
              <h3 className="text-label text-foreground">{mode.name}</h3>
              <p className="text-body text-muted-foreground mt-3">{mode.body}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
