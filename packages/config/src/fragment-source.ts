import type { FragmentSource, SourceFragment } from '@tessera/context-compiler';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  ValidationError,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { BlobStore } from '@tessera/storage';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The prefix Tessera reserves for its own blob metadata (today: the corpus migration marker). No
 * tenant can collide with it — {@link corpusScopeSegment} rejects a leading `_`.
 */
export const CORPUS_RESERVED_PREFIX = '_tessera/';

/**
 * A legal `(tenant, project)` segment in a corpus key: alphanumeric start, then alphanumerics, `.`,
 * `_` or `-`, up to 64 characters.
 *
 * This exists because `TenantId` is a bare `string` taken straight from an OIDC claim. For a
 * key-PREFIX partition that is not a detail: a tenant named `acme/x` would otherwise write into
 * `acme`'s namespace, which is the whole attack the layout exists to prevent. A leading `_` is
 * excluded to keep {@link CORPUS_RESERVED_PREFIX} unreachable.
 */
const SCOPE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The `(tenant, project)` a corpus blob belongs to (ADR-0067). */
export interface CorpusScope {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
}

/** The scope a base {@link createBlobFragmentSource} view reads and {@link putFragment} defaults to. */
export const DEFAULT_CORPUS_SCOPE: CorpusScope = {
  tenantId: DEFAULT_TENANT_ID,
  projectId: DEFAULT_PROJECT_ID,
};

/**
 * Validate one scope segment, **failing closed**. A tenant id that cannot be a legal segment raises
 * rather than silently sharing a namespace with another tenant.
 */
export function corpusScopeSegment(value: string, field: 'tenantId' | 'projectId'): string {
  if (!SCOPE_SEGMENT.test(value)) {
    throw new ValidationError(`invalid corpus ${field} — not a legal blob key segment`, {
      details: { [field]: value },
    });
  }
  return value;
}

/**
 * The corpus key for `ref` within `scope`: `{tenantId}/{projectId}/{ref}`.
 *
 * **The one place a corpus key is composed** (ADR-0067). The project segment is deliberate: every
 * index the corpus is joined against is keyed `(tenant, project)`, and a tenant-only key would leave
 * a by-ref read a cross-PROJECT IDOR inside a tenant — the same defect one level down.
 */
export function corpusKey(scope: CorpusScope, ref: string): string {
  return `${corpusScopeSegment(scope.tenantId, 'tenantId')}/${corpusScopeSegment(scope.projectId, 'projectId')}/${ref}`;
}

/** On-disk shape of a corpus document (one blob per `ref`). */
interface StoredDocument {
  readonly kind: string;
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
}

/** Encode a corpus document for blob storage (used by ingestion/tests to populate the corpus). */
export function encodeDocument(doc: StoredDocument): Uint8Array {
  return encoder.encode(JSON.stringify(doc));
}

/**
 * Store one corpus fragment under its `(scope, ref)` key.
 *
 * `scope` is a **required parameter** rather than an interface member on purpose: a free function's
 * arity is enforced by the compiler at every call site, while a new method parameter can be silently
 * ignored by an implementer (ADR-0057's distinction, applied to the write side).
 */
export async function putFragment(
  blob: BlobStore,
  fragment: SourceFragment,
  scope: CorpusScope,
): Promise<void> {
  const doc: StoredDocument =
    fragment.metadata === undefined
      ? { kind: fragment.kind, text: fragment.text }
      : { kind: fragment.kind, text: fragment.text, metadata: { ...fragment.metadata } };
  await blob.put(corpusKey(scope, fragment.ref), encodeDocument(doc));
}

/** Remove one corpus fragment. The twin of {@link putFragment}, so both compose the key one way. */
export async function deleteFragment(
  blob: BlobStore,
  ref: string,
  scope: CorpusScope,
): Promise<void> {
  await blob.delete(corpusKey(scope, ref));
}

/**
 * Compiler {@link FragmentSource} backed by the {@link BlobStore}: a document `ref` maps to a blob
 * holding JSON `{ kind, text, metadata? }` under its owning `(tenant, project)` (ADR-0067). Wires the
 * compiler's corpus seam to storage; ingestion's persistent DocumentSink writes these blobs. A missing
 * or malformed blob resolves to `undefined` (the compiler drops and traces it).
 *
 * **This factory is the adapter where tenant enforcement lives** — the reading of ADR-0033 that lets
 * `BlobStore` stay a dumb byte store. The value returned is the `(default, default)` view, exactly
 * like every other base store view; `forTenant`/`forProject` return views bound to another scope, and
 * a bound view cannot be talked out of its prefix.
 */
export function createBlobFragmentSource(
  blob: BlobStore,
  scope: CorpusScope = DEFAULT_CORPUS_SCOPE,
): FragmentSource {
  return {
    async get(ref) {
      const bytes = await blob.get(corpusKey(scope, ref));
      if (bytes === undefined) return undefined;

      let parsed: unknown;
      try {
        parsed = JSON.parse(decoder.decode(bytes));
      } catch {
        return undefined;
      }
      if (typeof parsed !== 'object' || parsed === null) return undefined;

      const doc = parsed as Partial<StoredDocument>;
      if (typeof doc.text !== 'string' || typeof doc.kind !== 'string') return undefined;

      const fragment: SourceFragment =
        doc.metadata !== undefined && typeof doc.metadata === 'object'
          ? { ref, text: doc.text, kind: doc.kind, metadata: doc.metadata }
          : { ref, text: doc.text, kind: doc.kind };
      return fragment;
    },

    forTenant(tenantId) {
      // A tenant switch resets the project to its default — mirrors every other scoped store.
      return createBlobFragmentSource(blob, { tenantId, projectId: DEFAULT_PROJECT_ID });
    },

    forProject(projectId) {
      return createBlobFragmentSource(blob, { tenantId: scope.tenantId, projectId });
    },
  };
}
