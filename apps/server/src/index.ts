/**
 * @tessera/server — runnable entrypoints that boot the Tessera engine (F-032).
 *
 * `createServerRuntime` loads + validates config and wires the Local profile (`@tessera/config`);
 * `startApiServer` serves the REST `/v1` API (F-011) and `startMcpServer` serves the MCP tools over
 * stdio (F-012). This app depends on config + api + mcp and is depended on by nothing, so the
 * dependency graph stays acyclic (ADR-0018). The `tessera-api` / `tessera-mcp` bins wrap these.
 */
export { createServerRuntime } from './bootstrap.js';
export type { ServerRuntimeOptions } from './bootstrap.js';
export { startApiServer } from './api.js';
export type { ApiServerHandle, ApiServerOptions } from './api.js';
export { startMcpServer } from './mcp.js';
export type { McpServerHandle } from './mcp.js';
