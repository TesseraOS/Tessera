/**
 * @tessera/ingestion — event-driven, incremental, secret-redacted ingestion (ARCHITECTURE §7).
 *
 * First-party filesystem + git connectors emit change events; a worker consumes them via the Queue
 * port and runs a pluggable processor pipeline (normalize → … → redact) into a DocumentSink.
 * Connectors, processors, the sink, and the manifest are ports — the plugin SDK for new sources and
 * stages (FR-1/2/3/6/7/8/9).
 */
export * from './domain.js';
export * from './hash.js';
export * from './ports/index.js';
export * from './redaction/redact.js';
export * from './processors/normalize.js';
export * from './processors/redact-processor.js';
export * from './connectors/scan-diff.js';
export * from './connectors/filesystem.js';
export * from './connectors/git.js';
export * from './connectors/github-client.js';
export * from './connectors/github.js';
export * from './extraction/candidate.js';
export * from './extraction/text.js';
export * from './extraction/adr-extractor.js';
export * from './extraction/github-extractor.js';
export * from './extraction/extract.js';
export * from './pipeline/decode.js';
export * from './pipeline/worker.js';
export * from './pipeline/coordinator.js';
export * from './adapters/in-memory-sink.js';
export * from './adapters/in-memory-manifest.js';
export * from './adapters/tee-sink.js';
export * from './adapters/memory-extraction-sink.js';
export * from './sources/registry.js';
export * from './sources/service.js';
export * from './symbols/extractor.js';
export * from './symbols/resolve-import.js';
export * from './adapters/graph-extraction-sink.js';
