'use client';

import dynamic from 'next/dynamic';

/**
 * Client boundary for the mini effect graph: below the fold, so the graph engine loads
 * lazily (ssr:false) and stays out of first-load JS. The placeholder reserves the height
 * (CLS 0).
 */
const EffectWeb = dynamic(() => import('@/components/art/effect-web').then((m) => m.EffectWeb), {
  ssr: false,
  loading: () => <div className="h-64 w-full md:h-72" aria-hidden="true" />,
});

export function EffectWebLazy() {
  return <EffectWeb />;
}
