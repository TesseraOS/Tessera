import { PipelineFlow } from '@/components/art/pipeline-flow';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

/**
 * How-it-works — the daylight chapter continues (MARKETING-DESIGN §3.5): three steps on
 * paper cards, then the pipeline told as flowing brand art (no code blocks — ADR-0044).
 */
const STEPS = [
  {
    number: '01',
    title: 'Connect your sources',
    body: 'Register repos, docs, and ADRs. Local-first indexing — nothing leaves your deployment unless you choose to.',
  },
  {
    number: '02',
    title: 'Tessera indexes and remembers',
    body: 'Embeddings, a knowledge graph, and durable memory. Decisions survive session resets and model swaps.',
  },
  {
    number: '03',
    title: 'Agents pull compiled context',
    body: 'Any MCP client receives a budgeted package where every fragment is cited — and can say why it made the cut.',
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      data-band="chapter"
      aria-labelledby="how-it-works-title"
      className="bg-background text-foreground scroll-mt-16 border-b"
    >
      <Container className="py-24 md:py-32">
        <Reveal>
          <SectionHeading
            id="how-it-works-title"
            title="From scattered to compiled"
            lead="Three steps between a pile of repositories and context your agents can cite."
          />
        </Reveal>
        <ol className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.number} className="h-full">
              <Reveal
                delay={index * 90}
                className="bg-card shadow-soft hover:shadow-lift h-full rounded-lg border p-6 transition duration-200 hover:-translate-y-0.5 md:p-7"
              >
                <p className="text-label text-rose">{step.number}</p>
                <h3 className="text-heading text-foreground mt-4">{step.title}</h3>
                <p className="text-body text-muted-foreground mt-3">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal delay={120}>
          <PipelineFlow className="mx-auto mt-14 max-w-4xl md:mt-20" />
        </Reveal>
      </Container>
    </section>
  );
}
