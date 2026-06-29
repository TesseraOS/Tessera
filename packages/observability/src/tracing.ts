import {
  context,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';

/** The tracer name all Tessera spans are created under. */
export const TRACER_NAME = '@tessera/observability';

const INVALID_TRACE_ID = '00000000000000000000000000000000';

/** The Tessera tracer (a no-op until a tracer provider is registered, e.g. by `startTelemetry`). */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

export interface SpanOptions {
  readonly attributes?: Attributes;
}

/**
 * Run `fn` inside an **active** span named `name`. Any spans created within `fn` nest under it (so
 * API → service → … spans chain via context). Records exceptions, sets an error status on throw,
 * and always ends the span. Returns whatever `fn` returns.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options: SpanOptions = {},
): Promise<T> {
  const spanOptions = options.attributes === undefined ? {} : { attributes: options.attributes };
  return getTracer().startActiveSpan(name, spanOptions, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** The active trace id (a correlation id for logs), or `undefined` when no span is active. */
export function currentTraceId(): string | undefined {
  const traceId = trace.getSpan(context.active())?.spanContext().traceId;
  return traceId === undefined || traceId === INVALID_TRACE_ID ? undefined : traceId;
}
