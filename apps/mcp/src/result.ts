import { TesseraError, type ErrorCode } from '@tessera/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Message returned for any internal (5xx-equivalent) fault — internal detail is never leaked. */
const GENERIC_INTERNAL_MESSAGE = 'internal server error';

interface ToolErrorEnvelope {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

/**
 * Map a thrown value to the same envelope shape + masking policy the REST surface uses (NFR-6):
 * domain `TesseraError`s surface their `code`/`message` (4xx are safe), `INTERNAL` and unknown
 * faults are masked. Implemented per-surface (REST maps Fastify/Zod errors; MCP input validation is
 * handled by the SDK before the handler runs), so this stays free of any HTTP dependency.
 */
function toEnvelope(error: unknown): ToolErrorEnvelope {
  if (error instanceof TesseraError) {
    if (error.code === 'INTERNAL') {
      return { code: 'INTERNAL', message: GENERIC_INTERNAL_MESSAGE };
    }
    return error.details === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, details: error.details };
  }
  return { code: 'INTERNAL', message: GENERIC_INTERNAL_MESSAGE };
}

/**
 * Wrap a successful result: JSON in a text block (human/legacy clients) plus `structuredContent`
 * (typed clients). No `outputSchema` is declared, so the SDK does not re-validate the structured
 * content — the domain services are the source of truth.
 */
export function toolOk(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    // Every tool returns a JSON object; the cast satisfies the SDK's structured-content type.
    structuredContent: value as Record<string, unknown>,
  };
}

/** Surface a failure cleanly (FR-35): a masked, consistent error envelope, never leaking internals. */
export function toolErr(error: unknown): CallToolResult {
  const envelope = toEnvelope(error);
  return {
    content: [{ type: 'text' as const, text: `${envelope.code}: ${envelope.message}` }],
    structuredContent: { error: envelope },
    isError: true,
  };
}

/** Run a tool handler, mapping any thrown value to a clean error result. */
export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolOk(await fn());
  } catch (error) {
    return toolErr(error);
  }
}
