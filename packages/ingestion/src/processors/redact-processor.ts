import type { Processor } from '../ports/processor.js';
import { redactSecrets } from '../redaction/redact.js';

/**
 * The secret-scrubbing stage (FR-9). The worker appends this as the **terminal, non-bypassable**
 * stage so redaction always runs immediately before persistence, regardless of how the rest of the
 * pipeline is configured. Merges its findings onto the document (counts only, never the values).
 */
export function createRedactionProcessor(): Processor {
  return {
    name: 'redact',
    process(document) {
      if (document.text.length === 0) return document;
      const { text, findings } = redactSecrets(document.text);
      if (findings.length === 0) return document;
      return { ...document, text, redactions: [...document.redactions, ...findings] };
    },
  };
}
