/** Content resolved for a retrieval `ref` — the unit the compiler assembles. */
export interface SourceFragment {
  readonly ref: string;
  readonly text: string;
  /** Content kind, e.g. `'code'`, `'markdown'`, `'memory'`. */
  readonly kind: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Resolves retrieval refs to their content — the corpus seam between retrieval and the compiler. In
 * production this is backed by the ingestion document/blob store; tests provide an in-memory source.
 * A ref with no content resolves to `undefined` and is dropped (and traced) by the compiler.
 */
export interface FragmentSource {
  get(ref: string): Promise<SourceFragment | undefined>;
}
