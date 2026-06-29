import type { Processor } from '../ports/processor.js';

/** UTF-8 byte-order mark (U+FEFF) that some editors prepend; stripped during normalization. */
const BOM = String.fromCharCode(0xfeff);

/**
 * Normalize text content in a content-preserving way: strip a leading UTF-8 BOM and convert
 * CRLF/CR line endings to LF so hashing, diffing, and retrieval are platform-independent. Does not
 * trim or reflow — code semantics are preserved. No-op for binary documents (empty text).
 */
export function createNormalizeProcessor(): Processor {
  return {
    name: 'normalize',
    process(document) {
      if (document.text.length === 0) return document;
      let text = document.text.startsWith(BOM) ? document.text.slice(BOM.length) : document.text;
      text = text.replace(/\r\n?/g, '\n');
      if (text === document.text) return document;
      return { ...document, text };
    },
  };
}
