import { CodeBlock } from '@/components/ui/code-block';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

/**
 * How-it-works — the sand chapter (MARKETING-DESIGN §3.6): the page steps into daylight.
 * Ordered steps (mono numerals allowed here only) on warm paper cards; the code block
 * sits as a dusk artifact on the sand. Real MCP tool names from apps/mcp.
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
    body: 'Any MCP client calls compile_context and receives a budgeted package where every fragment is cited.',
  },
] as const;

const MCP_TOOLS = `compile_context    budgeted, cited context packages
search             hybrid retrieval, scores included
get_effects        what a change touches, before you touch it
capture_memory     decisions that persist across sessions
query_graph        files, symbols, decisions — one graph`;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      data-band="sand"
      aria-labelledby="how-it-works-title"
      className="bg-background text-foreground scroll-mt-16 border-y"
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
                <p className="text-label text-rose font-mono">{step.number}</p>
                <h3 className="text-heading text-foreground mt-4">{step.title}</h3>
                <p className="text-body text-muted-foreground mt-3">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal delay={120}>
          <CodeBlock
            label="@tessera/mcp · tools your agent sees"
            code={MCP_TOOLS}
            className="mx-auto mt-12 max-w-3xl md:mt-16"
          />
        </Reveal>
      </Container>
    </section>
  );
}
