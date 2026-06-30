/**
 * @tessera/plugin-host — the Plugin SDK + host (FR-40/58; ARCHITECTURE §12).
 *
 * A uniform `Plugin` contract (manifest + Zod config schema + `setup → capability`) over the stable
 * extension-point ports (Connector/Processor/AIProvider/StorageBackend/RetrievalStrategy), and a
 * host providing discovery (registration), config validation, lifecycle, and **failure isolation**.
 * First-party connectors/embeddings ship as plugins using the same contract as third parties.
 */
export * from './domain.js';
export * from './host.js';
export * from './plugins/filesystem-connector.js';
export * from './plugins/embeddings.js';
