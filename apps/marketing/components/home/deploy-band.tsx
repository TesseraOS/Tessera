import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';

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
    <section id="deploy" aria-labelledby="deploy-title" className="scroll-mt-16 py-24 md:py-32">
      <Container>
        <SectionHeading
          id="deploy-title"
          title="Runs where your code runs"
          lead="The same engine across every profile — switch by configuration, not migration."
        />
        <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
          {MODES.map((mode) => (
            <div key={mode.name} className="border-t pt-5">
              <h3 className="text-label text-foreground font-mono">{mode.name}</h3>
              <p className="text-body text-muted-foreground mt-3">{mode.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
