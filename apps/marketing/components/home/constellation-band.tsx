'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  TELEMETRY_SEED,
  type ConstellationTelemetry,
} from '@/components/art/constellation-contract';

/**
 * ConstellationBand (MARKETING-DESIGN §3.3, ADR-0045 v4.3) — the living context graph,
 * one scroll south of the hero on the same continuous ground: no seam, no legends; the
 * constellation over its translucent wash with the telemetry island floating over the
 * canvas corner (pointer-events-none — it never blocks the graph). The Canvas engine
 * loads ssr:false (the flex-1 region reserves its height — CLS 0); numbers are
 * client-side simulation (the sr-only alternative says so).
 */
const Constellation = dynamic(
  () => import('@/components/art/constellation').then((m) => m.Constellation),
  { ssr: false, loading: () => <div className="absolute inset-0" aria-hidden="true" /> },
);

const numberFormat = new Intl.NumberFormat('en-US');

export function ConstellationBand() {
  const [telemetry, setTelemetry] = useState<ConstellationTelemetry>(TELEMETRY_SEED);

  return (
    <section
      id="graph"
      aria-labelledby="constellation-title"
      className="relative flex min-h-svh scroll-mt-16 flex-col pb-12"
    >
      <div className="graph-wash absolute inset-0" aria-hidden="true" />
      <h2 id="constellation-title" className="sr-only">
        The living context graph
      </h2>

      <div className="relative mt-6 min-h-0 flex-1 overflow-hidden">
        <Constellation onTelemetry={setTelemetry} />

        {/* telemetry island — floats over the graph, never blocks it */}
        <dl className="bg-card/90 border-border-strong pointer-events-none absolute right-4 bottom-4 z-10 flex items-baseline gap-x-8 rounded-lg border px-7 py-5 sm:right-6 sm:bottom-6 sm:gap-x-10">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-label text-faint-foreground uppercase">tokens</dt>
            <dd className="text-small text-foreground tabular-nums">
              {numberFormat.format(telemetry.tokens)}
            </dd>
          </div>
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <dt className="text-label text-faint-foreground uppercase">compiles/min</dt>
            <dd className="text-small text-foreground tabular-nums">{telemetry.rpm}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-label text-faint-foreground uppercase">agents</dt>
            <dd className="text-small text-foreground tabular-nums">{telemetry.agents}</dd>
          </div>
        </dl>
      </div>

      <p className="sr-only">
        An illustrative knowledge graph: repositories, files and symbols, git history, decisions,
        memory, and docs cluster around the Tessera hub, which serves compiled context to connected
        coding agents and their live sessions. Packets of context flow continuously through the
        graph; nodes can be clicked to simulate taking a source offline. All numbers are simulated
        demonstration data, not live telemetry.
      </p>
    </section>
  );
}
