import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { MetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  /** Register HTTP auto-instrumentation so incoming requests get server spans (default true). */
  readonly httpInstrumentation?: boolean;
  /** Span processors (default: a console exporter). Tests inject an in-memory processor. */
  readonly spanProcessors?: SpanProcessor[];
  /** Metric reader (default: none — metrics stay no-op until one is configured). */
  readonly metricReader?: MetricReader;
}

export interface Telemetry {
  /** Flush and stop the SDK (call on graceful shutdown). */
  shutdown(): Promise<void>;
}

/**
 * Start the OpenTelemetry SDK for the **process** (not libraries): registers the tracer/meter
 * providers + the async context manager so `withSpan`/`currentTraceId`/instruments become live, and
 * HTTP auto-instrumentation so requests get server spans that service spans nest under. Exporters
 * are configurable (console by default; OTLP is a config follow-up).
 */
export function startTelemetry(options: TelemetryOptions = {}): Telemetry {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName ?? 'tessera',
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.0.0',
    }),
    spanProcessors: options.spanProcessors ?? [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    ...(options.metricReader !== undefined ? { metricReader: options.metricReader } : {}),
    instrumentations: (options.httpInstrumentation ?? true) ? [new HttpInstrumentation()] : [],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
