import { CodeBlock } from '@/components/ui/code-block';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';

/**
 * How-it-works (MARKETING-DESIGN §3.5): a real ordered sequence — the one place mono step
 * numbers are allowed. The code block lists the actual MCP tools shipped in apps/mcp.
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
      aria-labelledby="how-it-works-title"
      className="scroll-mt-16 py-24 md:py-32"
    >
      <Container>
        <SectionHeading
          id="how-it-works-title"
          title="How it works"
          lead="From scattered repositories to compiled, explainable context in three steps."
        />
        <ol className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <li key={step.number}>
              <p className="text-label text-faint-foreground font-mono">{step.number}</p>
              <h3 className="text-heading text-foreground mt-3">{step.title}</h3>
              <p className="text-body text-muted-foreground mt-3">{step.body}</p>
            </li>
          ))}
        </ol>
        <CodeBlock
          label="@tessera/mcp · tools your agent sees"
          code={MCP_TOOLS}
          className="mx-auto mt-12 max-w-3xl md:mt-16"
        />
      </Container>
    </section>
  );
}
