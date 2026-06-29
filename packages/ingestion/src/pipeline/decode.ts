import { extname } from 'node:path';
import type { DocumentKind, ProcessedDocument, RawDocument, SourceDescriptor } from '../domain.js';
import { documentIdFor } from '../domain.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.sh',
  '.ps1',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.vue',
  '.svelte',
  '.yaml',
  '.yml',
  '.toml',
  '.sql',
  '.graphql',
]);

/** Decode bytes as UTF-8 text, flagging content that is binary (has a NUL byte or is not valid UTF-8). */
function decodeText(bytes: Uint8Array): { readonly text: string; readonly binary: boolean } {
  if (bytes.includes(0)) return { text: '', binary: true };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false };
  } catch {
    return { text: '', binary: true };
  }
}

function classify(path: string, binary: boolean): DocumentKind {
  if (binary) return 'binary';
  const extension = extname(path).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  return 'text';
}

/**
 * Build the seed {@link ProcessedDocument} from raw connector output: decode + classify, assign the
 * deterministic document id, and carry provenance forward. The processor pipeline (normalize →
 * … → redact) runs over this seed before it reaches the sink.
 */
export function decodeDocument(source: SourceDescriptor, raw: RawDocument): ProcessedDocument {
  const { text, binary } = decodeText(raw.bytes);
  return {
    id: documentIdFor(source.id, raw.path),
    source,
    path: raw.path,
    kind: classify(raw.path, binary),
    contentHash: raw.contentHash,
    text,
    metadata: raw.metadata,
    redactions: [],
  };
}
