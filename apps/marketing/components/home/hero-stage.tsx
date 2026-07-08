import { ConstellationBand } from '@/components/home/constellation-band';
import { Hero } from '@/components/home/hero';
import { ShaderFieldLazy } from '@/components/home/shader-field-lazy';

/**
 * HeroStage (MARKETING-DESIGN §2.5/§3.2–3.3, ADR-0045) — one continuous ground under
 * the hero and the constellation band. Layers bottom→top: atmosphere gradient (the
 * shader's reserved fallback) → shader field (lazy WebGL) → grain → the two sections.
 */
export function HeroStage() {
  return (
    <div className="relative overflow-hidden">
      <div className="atmosphere absolute inset-x-0 top-0 h-2/3" aria-hidden="true" />
      <div className="absolute inset-0" aria-hidden="true">
        <ShaderFieldLazy />
      </div>
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <Hero />
      <ConstellationBand />
    </div>
  );
}
