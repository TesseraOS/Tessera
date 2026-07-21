/**
 * @tessera/mcp — the Model Context Protocol surface over the Tessera engine (FR-35).
 *
 * `buildMcpServer(services)` exposes the agent tool surface — retrieval, the knowledge graph,
 * memory, sources, stats, projects, tokens, and the first-party skills registry; {@link McpToolName}
 * is the authoritative list. All of them wrap the **same** domain services as the REST API (F-011,
 * via a type-only `ApiServices` import), so the two surfaces never diverge — except `list_skills` /
 * `get_skill`, which serve static first-party content and wrap no service at all. Inputs are validated against
 * Zod shapes; failures map to a consistent, masked error envelope (matching REST's). Services are
 * injected (the deployment-profile wiring is F-015); `startMcpStdio` serves over stdio for agents.
 */
export { buildMcpServer, SERVER_INFO } from './server.js';
export type { BuildMcpServerOptions } from './server.js';
export { startMcpStdio } from './stdio.js';
export { buildExplanation } from './explain.js';
export type { Explanation, FragmentExplanation, StageExplanation } from './explain.js';
export { toolOk, toolErr, runTool } from './result.js';

// MCP gateway — multi-client auth + quotas (F-026; FR-36) + audit recording (F-047, closing the F-027
// seam). Reuses the F-025 auth + F-027 audit models (type-only).
export {
  MCP_AUDIT_ACTIONS,
  TOOL_PERMISSIONS,
  createMcpGateway,
  defaultCredentialResolver,
  type CredentialResolver,
  type McpCallContext,
  type McpGateway,
  type McpGatewayOptions,
  type McpToolName,
} from './gateway.js';
export {
  createInMemoryQuotaLimiter,
  type InMemoryQuotaOptions,
  type QuotaDecision,
  type QuotaLimiter,
} from './quota.js';
export {
  searchShape,
  compileShape,
  explainShape,
  effectsShape,
  captureMemoryShape,
  listSkillsShape,
  getSkillShape,
} from './schemas.js';
