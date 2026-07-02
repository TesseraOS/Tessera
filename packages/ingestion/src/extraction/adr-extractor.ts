import type { ProcessedDocument } from '../domain.js';
import type { CandidateMemory, MemoryExtractor } from './candidate.js';
import { firstHeading } from './text.js';

/** Confidence for an ADR-derived decision memory (authoritative but machine-extracted). */
const ADR_CONFIDENCE = 0.9;

/** `docs/adr/NNNN-slug.md`, capturing the 4-digit ADR number. Paths are `/`-delimited (source-relative). */
const ADR_PATH_PATTERN = /(?:^|\/)docs\/adr\/(\d{4})-[^/]*\.md$/;
/** The ADR template is not a real decision. */
const TEMPLATE_NUMBER = '0000';

/** Body of a `## <name>` section up to the next `## ` heading (or end), trimmed; `undefined` if absent. */
function sectionBody(text: string, name: string): string | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${name}\\s*$`, 'i').test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body.length > 0 ? body : undefined;
}

/** Value of an `- **Label:** value` field, or `undefined`. */
function fieldValue(text: string, label: string): string | undefined {
  const match = new RegExp(`^-\\s+\\*\\*${label}:\\*\\*\\s+(.+?)\\s*$`, 'm').exec(text);
  return match?.[1];
}

/**
 * Extracts a `decision` memory from an ingested **ADR** (FR-14). Keyed off the `docs/adr/NNNN-*.md`
 * path so it works for ADRs ingested by any connector (filesystem/git). The memory body is the ADR's
 * **Decision** section (falling back to the whole document), sourced as `adr:NNNN` for idempotent
 * re-ingest, tagged with the ADR status. The template (`0000`) is ignored.
 */
export const adrMemoryExtractor: MemoryExtractor = (
  document: ProcessedDocument,
): readonly CandidateMemory[] => {
  const match = ADR_PATH_PATTERN.exec(document.path);
  const number = match?.[1];
  if (number === undefined || number === TEMPLATE_NUMBER) return [];
  if (document.text.trim().length === 0) return [];

  const title = firstHeading(document.text) ?? `ADR-${number}`;
  const body = sectionBody(document.text, 'Decision') ?? document.text.trim();
  const status = fieldValue(document.text, 'Status');
  const tags = ['adr', ...(status !== undefined ? [`status:${status.toLowerCase()}`] : [])];

  return [
    {
      kind: 'decision',
      title,
      body,
      scope: 'global',
      confidence: ADR_CONFIDENCE,
      metadata: { source: `adr:${number}`, links: [document.path], tags },
    },
  ];
};
