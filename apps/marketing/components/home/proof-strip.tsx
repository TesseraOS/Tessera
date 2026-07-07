import { Container } from '@/components/ui/container';

/** Typographic wordmarks of real MCP clients (MARKETING-DESIGN §3.3) — no logos, no fakes. */
const MCP_CLIENTS = ['Claude Code', 'Cursor', 'Cline', 'Codex CLI', 'Continue'] as const;

export function ProofStrip() {
  return (
    <section aria-label="Compatible agents" className="bg-surface border-y">
      <Container className="flex flex-col items-center gap-5 py-10 md:flex-row md:justify-between">
        <p className="text-small text-faint-foreground">Works with any MCP-capable agent</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {MCP_CLIENTS.map((client) => (
            <li key={client} className="text-label text-muted-foreground font-mono">
              {client}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
