'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  TELEMETRY_SEED,
  type ConstellationTelemetry,
} from '@/components/art/constellation-contract';
import { Container } from '@/components/ui/container';

/**
 * ConstellationBand (MARKETING-DESIGN §3.3, ADR-0045 v4.1) — the living context graph,
 * one scroll south of the hero on the same continuous ground: no seam, no legends, just
 * the constellation over its translucent wash and a right-aligned telemetry row. The
 * Canvas engine loads ssr:false (the flex-1 region reserves its height — CLS 0);
 * numbers are client-side simulation (the sr-only alternative says so).
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

      <div className="relative mt-6 min-h-0 flex-1">
        <Constellation onTelemetry={setTelemetry} />
      </div>

      <Container className="relative z-10 mt-4">
        <dl className="flex flex-wrap items-end justify-end gap-x-12 gap-y-4 text-right">
          <div>
            <dt className="text-label text-faint-foreground uppercase">tokens served</dt>
            <dd className="text-heading text-foreground mt-1 tabular-nums">
              {numberFormat.format(telemetry.tokens)}
            </dd>
          </div>
          <div>
            <dt className="text-label text-faint-foreground uppercase">compiles/min</dt>
            <dd className="text-heading text-foreground mt-1 tabular-nums">{telemetry.rpm}</dd>
          </div>
          <div>
            <dt className="text-label text-faint-foreground uppercase">agents connected</dt>
            <dd className="text-heading text-foreground mt-1 tabular-nums">{telemetry.agents}</dd>
          </div>
        </dl>
      </Container>

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
