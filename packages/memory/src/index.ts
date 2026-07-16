/**
 * @tessera/memory — the versioned memory subsystem (ARCHITECTURE §5; FR-10/11/12/13).
 *
 * Typed memory kinds with metadata, point-in-time versioning (edits append a superseding version;
 * prior versions are immutable), and a domain service for capture/edit that REST (F-011) and MCP
 * (F-012) expose. Persistence is behind the MemoryStore port: in-memory + SQLite (local default).
 */
export * from './domain.js';
export * from './validation.js';
export * from './ports/index.js';
export * from './service/memory-service.js';
export * from './service/retention.js';
export * from './adapters/in-memory-memory-store.js';
export * from './adapters/sqlite-memory-store.js';
