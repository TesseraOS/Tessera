import type { ContextFragment, ContextPackage } from '@/lib/api/types';

/**
 * Serialize a compiled Context Package for the human↔agent handoff (F-062; FR-32/FR-44).
 *
 * **Why this is client-side, and why that does NOT contradict F-060/F-061.** Both of those moved
 * logic to the server so REST and MCP could not disagree — but they were computing **facts**
 * (workspace counts, a result's label), where two implementations can disagree about *truth*.
 * Markdown is not a fact: it is a re-formatting of bytes the caller already holds. There is nothing
 * to disagree about. An agent already receives the whole `ContextPackage` from `compile_context`;
 * Markdown would be a lossier, fatter encoding of what it has. The consumer here is a person's
 * clipboard, and presentation belongs in the presentation layer. A server-side export would cost an
 * endpoint, an SDK regen, an MCP tool, and compile-envelope budget — to serve nobody.
 *
 * Pure: no DOM, no network, so the whole thing unit-tests directly.
 */

/**
 * What a fragment should be *called*. `ref` is `sha256(sourceId:path)` for ingested content — a
 * 64-char hash. "Citation-preserving" is meaningless if the citation is unreadable: an agent cannot
 * open `a3f8b2c9…`. The compiler already forwards the corpus metadata (`provenance.source`), so the
 * real path is on the wire and just needs using. The raw `ref` is still emitted alongside, so
 * nothing is lost.
 */
export function citationOf(fragment: ContextFragment): string {
  const source = fragment.provenance.source;
  const path = source?.['path'];
  if (typeof path === 'string' && path.length > 0) return path;
  const title = source?.['title'];
  if (typeof title === 'string' && title.length > 0) return title;
  return fragment.ref;
}

/**
 * A fence long enough to contain `text`.
 *
 * **This is the export's injection bug, and it is not hypothetical.** Fragment text is ingested
 * repository content and `markdown` is a first-class document kind, so fragment bodies *will*
 * contain ``` runs. A hardcoded triple-backtick wrapper produces structurally broken Markdown the
 * first time anyone compiles a real `.md` file. CommonMark's rule: an outer fence must be longer
 * than any run inside. Same discipline as F-061's offsets-not-HTML — structurally correct rather
 * than hopefully correct.
 */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const run of text.matchAll(/`+/g)) longest = Math.max(longest, run[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** A language hint for the fence, from the fragment's kind. */
function fenceLanguage(fragment: ContextFragment): string {
  const path = fragment.provenance.source?.['path'];
  if (typeof path === 'string') {
    const ext = path.slice(path.lastIndexOf('.') + 1);
    if (ext.length > 0 && ext.length <= 4 && ext !== path) return ext;
  }
  return fragment.kind === 'memory' ? 'text' : fragment.kind;
}

/**
 * One fragment as Markdown: citation heading, why-included, provenance, ref, then the fenced body.
 *
 * Per-fragment copy emits *this*, never the bare text — otherwise the single action most likely to
 * be used is the one that throws the citation away.
 */
export function fragmentToMarkdown(fragment: ContextFragment): string {
  const fence = fenceFor(fragment.text);
  const signals = fragment.provenance.signals.join(', ');
  const lines = [
    `### ${citationOf(fragment)}`,
    '',
    // `whyIncluded` is FR-32's own artifact and already self-documents compression
    // ("compressed to fit budget (N→M tokens)") — copied verbatim rather than paraphrased.
    `**Why included:** ${fragment.whyIncluded}`,
    `**Signals:** ${signals.length > 0 ? signals : 'none'} · **Retrieval score:** ${fragment.provenance.retrievalScore.toFixed(3)} · **Tokens:** ${fragment.tokens}`,
    `**Ref:** \`${fragment.ref}\``,
  ];

  const expandedFrom = fragment.provenance.expandedFrom;
  if (typeof expandedFrom === 'string' && expandedFrom.length > 0) {
    lines.push(`**Expanded from:** \`${expandedFrom}\``);
  }

  lines.push('', `${fence}${fenceLanguage(fragment)}`, fragment.text, fence);
  return lines.join('\n');
}

/**
 * The whole package as citation-preserving Markdown — what you paste into an agent.
 *
 * Section headings come from `section.title`, which **is the fragment kind** (the assemble stage
 * groups by kind), not an invented heading. The compilation trace is deliberately omitted: the
 * acceptance asks for "sections + refs + why-included", and the clean split is **Markdown = what you
 * hand an agent; JSON = the complete record** (trace included, exactly as the API sent it).
 */
export function toMarkdown(pkg: ContextPackage): string {
  const fragmentCount = pkg.scores.fragmentCount;
  const parts = [
    `# Context: ${pkg.task}`,
    '',
    `Compiled by Tessera · ${fragmentCount} fragment${fragmentCount === 1 ? '' : 's'} · ${pkg.totalTokens.toLocaleString()} / ${pkg.budget.toLocaleString()} tokens.`,
  ];

  if (pkg.sections.length === 0) {
    // Say so rather than emit a heading with nothing under it — an empty package pasted into an
    // agent should read as "nothing matched", not as a truncated document.
    parts.push('', '_Retrieval matched nothing for this task; the package is empty._');
    return `${parts.join('\n')}\n`;
  }

  for (const section of pkg.sections) {
    parts.push('', `## ${section.title}`);
    for (const fragment of section.fragments) {
      parts.push('', fragmentToMarkdown(fragment));
    }
  }

  return `${parts.join('\n')}\n`;
}

/** The complete record — the bytes the API sent, trace and all. */
export function toJson(pkg: ContextPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** A filesystem-safe download name derived from the task. */
export function exportFilename(pkg: ContextPackage, extension: string): string {
  const slug = pkg.task
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return `tessera-context-${slug.length > 0 ? slug : 'package'}.${extension}`;
}
