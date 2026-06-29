/**
 * @tessera/mcp — the Model Context Protocol surface over the Tessera engine (FR-35).
 *
 * `buildMcpServer(services)` exposes five tools — `search`, `compile_context`, `get_effects`,
 * `capture_memory`, `explain` — that wrap the **same** domain services as the REST API (F-011, via a
 * type-only `ApiServices` import), so the two surfaces never diverge. Inputs are validated against
 * Zod shapes; failures map to a consistent, masked error envelope (matching REST's). Services are
 * injected (the deployment-profile wiring is F-015); `startMcpStdio` serves over stdio for agents.
 */
export { buildMcpServer, SERVER_INFO } from './server.js';
export { startMcpStdio } from './stdio.js';
export { buildExplanation } from './explain.js';
export type { Explanation, FragmentExplanation, StageExplanation } from './explain.js';
export { toolOk, toolErr, runTool } from './result.js';
export {
  searchShape,
  compileShape,
  explainShape,
  effectsShape,
  captureMemoryShape,
} from './schemas.js';
