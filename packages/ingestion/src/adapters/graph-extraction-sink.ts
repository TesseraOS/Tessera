import { posix } from 'node:path';
import type { DocumentRef, DocumentSink } from '../ports/sink.js';
import { fileNodeKey, resolveRelativeImport } from '../symbols/resolve-import.js';
import type { GraphNodeRef, GraphWriteService, SymbolExtractor } from '../symbols/extractor.js';

/** Mirrors `@tessera/knowledge-graph` `EFFECT_LINK_KIND` (kept as a literal to avoid a package dep). */
const EFFECT_LINK = 'EFFECT_LINK';

export interface GraphExtractionSinkOptions {
  readonly extractor: SymbolExtractor;
  readonly graph: GraphWriteService;
}

/**
 * A {@link DocumentSink} that populates the knowledge graph from ingested source files (F-040): for each
 * code file it extracts symbols + imports (via the {@link SymbolExtractor}) and writes `file`/`symbol`
 * nodes + `defines`/`imports` edges, then re-derives the static effect-links (imports inverted → "changing
 * the imported file may require reviewing the importer", FR-18) so `get_effects` returns real dependents.
 *
 * **Incremental (FR-63):** the manifest ensures only changed files reach the sink; each `upsert` **replaces
 * the file's OUTGOING edges** (and clears the stale effect-links pointing at it) before re-inserting, so a
 * removed import does not linger — without clobbering edges from other (unchanged) files. It does **not**
 * persist the documents; compose it via {@link import('./tee-sink.js').teeSink}. Non-code documents
 * (extractor returns `undefined`) are skipped. Orphan symbol nodes from a removed symbol are inert
 * (no edges) — a GC pass is a documented seam.
 */
export function createGraphExtractionSink(options: GraphExtractionSinkOptions): DocumentSink {
  const { extractor, graph } = options;

  async function forgetFile(path: string): Promise<void> {
    const fileRef: GraphNodeRef = { kind: 'file', key: fileNodeKey(path) };
    // Clear the file's own outgoing edges + the stale effect-links pointing at it; other files' edges
    // (e.g. an unchanged importer's `imports` edge to this file) are preserved and re-derived below.
    await graph.removeEdges({ from: fileRef });
    await graph.removeEdges({ to: fileRef, kind: EFFECT_LINK });
  }

  return {
    async upsert(document) {
      const extracted = await extractor.extract(document);
      if (extracted === undefined) return; // language/kind not handled

      const path = document.path;
      const fileKey = fileNodeKey(path);
      const fileRef: GraphNodeRef = { kind: 'file', key: fileKey };
      await forgetFile(path);

      await graph.upsertNode({
        kind: 'file',
        key: fileKey,
        label: posix.basename(path),
        metadata: { path },
      });

      for (const symbol of extracted.symbols) {
        const key = `${fileKey}#${symbol.name}`;
        await graph.upsertNode({
          kind: 'symbol',
          key,
          label: symbol.name,
          metadata: {
            file: path,
            ...(symbol.kind !== undefined ? { symbolKind: symbol.kind } : {}),
          },
        });
        await graph.upsertEdge({ from: fileRef, to: { kind: 'symbol', key }, kind: 'defines' });
      }

      for (const imp of extracted.imports) {
        const target = resolveRelativeImport(path, imp.specifier);
        if (target === undefined) continue; // bare/package import or out-of-repo → skip (documented)
        await graph.upsertNode({ kind: 'file', key: target, label: posix.basename(target) });
        await graph.upsertEdge({
          from: fileRef,
          to: { kind: 'file', key: target },
          kind: 'imports',
        });
      }

      // Re-derive effect-links from the current dependency edges (idempotent).
      await graph.deriveStaticEffectLinks();
    },

    async remove(ref: DocumentRef) {
      await forgetFile(ref.path);
      await graph.deriveStaticEffectLinks();
    },
  };
}
