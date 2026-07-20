import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import agentClients from '@/generated/agent-clients.json';

/**
 * Renders an agent's MCP connection snippet FROM the generated registry
 * (`generated/agent-clients.json`, derived from the CLI's own MCP_CLIENTS table and
 * renderer — ADR-0054 §4). Docs never hand-copy a snippet: if the CLI's output changes,
 * the drift gate forces regeneration and these pages follow automatically.
 */

interface AgentConfigProps {
  /** Stable client id from the registry (e.g. `claude-code`). */
  id: string;
  /** Which launch form to show: the npx form (publish-pending) or the from-source form. */
  variant: 'npx' | 'local';
}

export function AgentConfig({ id, variant }: AgentConfigProps) {
  const client = agentClients.clients.find((candidate) => candidate.id === id);
  if (!client) {
    // A typo'd id must fail the build loudly, not render an empty box.
    throw new Error(
      `AgentConfig: unknown client id "${id}" — known: ${agentClients.clients
        .map((c) => c.id)
        .join(', ')}`,
    );
  }
  const code = variant === 'npx' ? client.snippetNpx : client.snippetLocal;
  const lang = client.format === 'toml-mcp-servers' ? 'toml' : 'json';
  return <DynamicCodeBlock lang={lang} code={code} />;
}

/** The config-file location for an agent, from the same registry. */
export function AgentConfigFile({ id }: { id: string }) {
  const client = agentClients.clients.find((candidate) => candidate.id === id);
  if (!client) throw new Error(`AgentConfigFile: unknown client id "${id}"`);
  return <code>{client.file}</code>;
}
