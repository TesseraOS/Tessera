'use client';

import dynamic from 'next/dynamic';

/**
 * Client boundary for the WebGL shader field: ssr:false so the canvas never touches the
 * server-rendered LCP; while loading (and wherever WebGL is unavailable) the stage's
 * `.atmosphere` gradient remains the ground.
 */
const ShaderField = dynamic(
  () => import('@/components/art/shader-field').then((m) => m.ShaderField),
  { ssr: false, loading: () => null },
);

export function ShaderFieldLazy() {
  return <ShaderField />;
}
