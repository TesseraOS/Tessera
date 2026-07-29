import type { FragmentSource } from '@tessera/context-compiler';
import { fileNodeKey } from '@tessera/ingestion';
import type { CandidateNode, FusedCandidate, HybridRetriever } from '@tessera/retrieval';
import { extractSnippet } from './search-snippet.js';

/**
 * Search-result enrichment (F-061, and F-073's fix): turn a ranked list of opaque refs into results a
 * person or an agent can actually act on — a readable label, what kind of thing it is, the graph node
 * it corresponds to, and (on request) a query-relevant excerpt.
 *
 * **Why here, in the composition root.** The retrievers deal in refs and know nothing of the corpus;
 * only the composition root holds both the retriever and the {@link FragmentSource}. So this is a
 * decorator over the assembled {@link HybridRetriever}, mirroring `createIndexingDocumentSink` and
 * `createIndexingMemoryService` in this same directory. That keeps `@tessera/retrieval` pure (no
 * corpus dependency, no port change, no adapter or conformance churn), and — because REST
 * (`/v1/search`) and MCP (`search`) both call the one `services.search` — **both surfaces are
 * enriched by one implementation** and cannot drift apart (ADR-0036; the F-060 `computeWorkspaceStats`
 * lesson). It also adds no `ApiServices` member, so the `instrumentServices` trap (E-015, which has
 * already 500ed a route once) is structurally avoided.
 *
 * **Tenant-safe twice over.** The decorator wraps an already-`forTenant`-scoped retriever and only
 * ever looks up refs that scoped retriever returned — so it could not widen what a tenant sees even
 * if the corpus were open. Since F-075/ADR-0067 it no longer relies on that argument alone: the
 * {@link FragmentSource} is itself scoped and is rebound in `forTenant`/`forProject` below, so the
 * lookup is confined to the same `(tenant, project)` as the retriever it decorates.
 *
 * That second guarantee is the one that mattered. The first held only because every ref came from a
 * scoped retriever, which is exactly the premise a by-ref endpoint breaks — refs are
 * `sha256(sourceId:path)`, derivable and not secret, so `GET /v1/fragments/:ref` over an unscoped
 * corpus would have been a cross-tenant IDOR. That endpoint is why F-075 exists, and why this
 * decorator must rebind both halves rather than just its inner retriever.
 */

/** What a result is, as the dashboard's kind filter names them. */
export type ResultKind = 'file' | 'memory' | 'symbol';

function readString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Derive the result kind from the corpus fragment. Not a stored field: ingestion records a
 * `DocumentKind` (`code`/`markdown`/`text`; `binary` is never indexed) and memory capture records
 * `'memory'` — so within the corpus, "not a memory" means a file from a scanned source. A ref with
 * **no fragment at all** is handled by the caller: it is a graph/symbolic node id, a separate ref
 * space that was never written to the corpus.
 */
function resultKindOf(fragmentKind: string): ResultKind {
  return fragmentKind === 'memory' ? 'memory' : 'file';
}

/**
 * Wrap a hybrid retriever so every hit carries a label/kind/node, plus a snippet when asked.
 *
 * A ref with no corpus fragment (every graph/symbolic hit — their node ids are a separate ref space)
 * is passed through **unchanged, never dropped**: dropping it would silently delete the graph signal
 * from search results, which is a far worse bug than an unenriched row.
 */
export function createEnrichedRetriever(
  inner: HybridRetriever,
  fragments: FragmentSource,
): HybridRetriever {
  return {
    async search(query) {
      const results = await inner.search(query);
      const include = query.include;

      return Promise.all(
        results.map(async (candidate): Promise<FusedCandidate> => {
          const fragment = await fragments.get(candidate.ref);
          if (fragment === undefined) {
            // A graph/symbolic node id. The retriever already gave it a label from the node; leave it.
            return include?.kind === true ? { ...candidate, kind: 'symbol' } : candidate;
          }

          const metadata = fragment.metadata as Record<string, unknown> | undefined;
          const kind = resultKindOf(fragment.kind);

          // A memory is titled by its title; a file by its path. The retriever's own label (set only
          // by the graph/symbolic retrievers, from the node) wins if present — it is closer to the
          // signal that actually matched.
          const label =
            candidate.label ??
            (kind === 'memory' ? readString(metadata, 'title') : readString(metadata, 'path'));

          // `GET /v1/effects` is keyed by {kind, key}, and a file node's key is its EXTENSIONLESS
          // source-relative path (ADR-0041). Deriving that needs `fileNodeKey` from
          // @tessera/ingestion — which is exactly why this must happen server-side: apps/web must
          // not depend on the ingestion package to guess at a key rule.
          const path = readString(metadata, 'path');
          const node: CandidateNode | undefined =
            include?.node === true && kind === 'file' && path !== undefined
              ? { kind: 'file', key: fileNodeKey(path) }
              : undefined;

          const snippet =
            include?.snippet === undefined
              ? undefined
              : extractSnippet(fragment.text, query.text, {
                  ...(include.snippet.maxChars !== undefined
                    ? { maxChars: include.snippet.maxChars }
                    : {}),
                });

          return {
            ...candidate,
            // The label is always on: an unlabelled hit is a 64-char hash, which is not an answer at
            // any price. Everything else is depth the caller asks for — measured, because a ranked
            // answer is billed to every agent on every call (NFR-4).
            ...(label !== undefined ? { label } : {}),
            ...(include?.kind === true ? { kind } : {}),
            ...(node !== undefined ? { node } : {}),
            ...(snippet !== undefined ? { snippet } : {}),
          };
        }),
      );
    },

    forTenant(tenantId) {
      // BOTH halves move together (ADR-0067). Rebinding only the retriever would leave the corpus
      // reading the default tenant's blobs for another tenant's refs — labels and snippets from the
      // wrong org, or (harmlessly but wrongly) nothing at all.
      return createEnrichedRetriever(inner.forTenant(tenantId), fragments.forTenant(tenantId));
    },

    forProject(projectId) {
      // Same, for the project scope (ADR-0037).
      return createEnrichedRetriever(inner.forProject(projectId), fragments.forProject(projectId));
    },
  };
}
