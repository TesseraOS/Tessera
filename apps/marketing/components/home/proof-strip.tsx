import { AGENT_MARKS, AgentMarkIcon } from '@/components/agent-marks';
import { Container } from '@/components/ui/container';

/**
 * Marquee strip (MARKETING-DESIGN §3.5, ADR-0045 v4.1): the agents Tessera serves, as
 * monochrome brand marks + names on a slow linear loop — pauses on hover/focus,
 * renders static under reduced motion. The second copy is aria-hidden. Marks re-ink
 * with the theme (currentColor); agents without a published mark stay typographic.
 */
export function ProofStrip() {
  return (
    <section aria-label="Compatible agents" className="bg-surface/60 border-y">
      <Container className="flex flex-col items-center gap-5 py-8 md:flex-row md:gap-10">
        <p className="text-small text-faint-foreground shrink-0">
          Works with any MCP-capable agent
        </p>
        <div className="marquee fade-x relative w-full flex-1 overflow-hidden">
          <ul className="marquee-track flex w-max items-center gap-12 pr-12">
            {[...AGENT_MARKS, ...AGENT_MARKS].map((agent, index) => (
              <li
                key={`${agent.name}-${index}`}
                aria-hidden={index >= AGENT_MARKS.length || undefined}
                className="text-muted-foreground flex items-center gap-2.5 whitespace-nowrap"
              >
                {agent.path ? (
                  <AgentMarkIcon
                    path={agent.path}
                    {...(agent.viewBox ? { viewBox: agent.viewBox } : {})}
                    className="size-4 shrink-0"
                  />
                ) : null}
                <span className="text-small">{agent.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
