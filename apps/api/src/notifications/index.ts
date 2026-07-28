/**
 * Notifications (F-065; FR-38/FR-49, ADR-0064). The model, the projection, and the store port are
 * Fastify-free — the composition root builds a persistent adapter, and the `list_notifications` MCP
 * tool calls the same projection the `/v1/notifications` routes do (ADR-0036, one engine/two
 * surfaces).
 *
 * A notification is **derived from the audit trail**; the store persists only what cannot be
 * derived — this principal's read state and preferences.
 */
export * from './model.js';
export * from './project.js';
