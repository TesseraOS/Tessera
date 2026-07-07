'use client';

import dynamic from 'next/dynamic';

/**
 * Client boundary for the hero's live graph: loaded ssr:false so the canvas never blocks
 * the LCP (the server-rendered h1). The loading state reserves the layer (CLS 0).
 */
const LiveGraph = dynamic(() => import('@/components/art/live-graph').then((m) => m.LiveGraph), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />,
});

export function HeroGraph() {
  return <LiveGraph />;
}
