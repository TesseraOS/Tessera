import { Container } from '@/components/ui/container';

/**
 * Marquee strip (MARKETING-DESIGN §3.3): real MCP clients as typographic wordmarks on a
 * slow linear loop — pauses on hover/focus, renders static under reduced motion. The
 * second copy is aria-hidden; honesty rule: names only, no scraped logos.
 */
const MCP_CLIENTS = [
  'Claude Code',
  'Cursor',
  'Cline',
  'Codex CLI',
  'Continue',
  'Windsurf',
] as const;

export function ProofStrip() {
  return (
    <section aria-label="Compatible agents" className="bg-surface/60 border-y">
      <Container className="flex flex-col items-center gap-5 py-8 md:flex-row md:gap-10">
        <p className="text-small text-faint-foreground shrink-0">
          Works with any MCP-capable agent
        </p>
        <div className="marquee fade-x relative w-full flex-1 overflow-hidden">
          <ul className="marquee-track flex w-max items-center gap-14 pr-14">
            {[...MCP_CLIENTS, ...MCP_CLIENTS].map((client, index) => (
              <li
                key={`${client}-${index}`}
                aria-hidden={index >= MCP_CLIENTS.length || undefined}
                className="text-label text-muted-foreground font-mono whitespace-nowrap"
              >
                {client}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
