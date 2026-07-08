import type React from 'react';
import { cn } from '@/lib/utils';

/**
 * PipelineFlow (MARKETING-DESIGN §3.6, ADR-0045 v4.1): sources → the tessera → agents.
 * Wide screens: HTML chips and SVG connectors share ONE 1000×260 coordinate system
 * (percent-positioned chips over a stretched viewBox, hairline strokes via
 * non-scaling-stroke), so every line lands on a chip center by construction. The
 * tessera sits in a bordered card unit. Narrow screens: a vertical stack. The marching
 * dashes are this band's ambient system, silenced by the reduced-motion kill-switch.
 */

const W = 1000;
const H = 260;

const SOURCES = [
  { label: 'repos', tone: 'bg-clay', x: 110, y: 40 },
  { label: 'decisions', tone: 'bg-gold', x: 110, y: 130 },
  { label: 'memory', tone: 'bg-rose', x: 110, y: 220 },
] as const;

const AGENTS = [
  { label: 'claude code', tone: 'bg-rose', x: 884, y: 88 },
  { label: 'any MCP agent', tone: 'bg-rose', x: 884, y: 172 },
] as const;

const CENTER = { x: 500, y: 130 };

const inCurve = (x: number, y: number) =>
  `M${x} ${y} C ${(x + CENTER.x) / 2} ${y}, ${(x + CENTER.x) / 2} ${CENTER.y}, ${CENTER.x} ${CENTER.y}`;
const outCurve = (x: number, y: number) =>
  `M${CENTER.x} ${CENTER.y} C ${(CENTER.x + x) / 2} ${CENTER.y}, ${(CENTER.x + x) / 2} ${y}, ${x} ${y}`;

const at = (x: number, y: number): React.CSSProperties => ({
  left: `${(x / W) * 100}%`,
  top: `${(y / H) * 100}%`,
});

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="bg-secondary flex max-w-40 items-center gap-2 rounded-md px-3 py-2">
      <span className={cn('size-1.5 shrink-0 rounded-full', tone)} />
      <span className="text-label text-muted-foreground truncate">{label}</span>
    </span>
  );
}

/** The tessera in its bordered unit — mini mosaic, gilded arrival, caption. */
function TesseraUnit() {
  return (
    <span className="bg-card/85 border-border-strong flex flex-col items-center gap-1.5 rounded-lg border px-3 pt-3 pb-2">
      <svg viewBox="0 -6 104 108" className="size-20 md:size-24" aria-hidden="true">
        <g fill="var(--foreground)">
          <rect x="4" y="4" width="26" height="26" rx="6" fillOpacity="0.55" />
          <rect x="37" y="4" width="26" height="26" rx="6" fillOpacity="0.8" />
          <rect x="4" y="37" width="26" height="26" rx="6" fillOpacity="0.8" />
          <rect x="37" y="37" width="26" height="26" rx="6" />
          <rect x="70" y="37" width="26" height="26" rx="6" fillOpacity="0.9" />
          <rect x="4" y="70" width="26" height="26" rx="6" fillOpacity="0.45" />
          <rect x="37" y="70" width="26" height="26" rx="6" fillOpacity="0.9" />
          <rect x="70" y="70" width="26" height="26" rx="6" fillOpacity="0.7" />
        </g>
        <rect
          x="71"
          y="5"
          width="24"
          height="24"
          rx="6"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
        <rect x="76" y="-4" width="26" height="26" rx="6" fill="var(--gold)" />
      </svg>
      <span className="text-label text-faint-foreground whitespace-nowrap">
        compiled · budgeted · cited
      </span>
    </span>
  );
}

export function PipelineFlow({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Pipeline: repositories, decisions, and memory flow into the tessera, which serves compiled context to coding agents"
      className={cn('w-full', className)}
    >
      {/* wide: one aligned coordinate system */}
      <div className="relative hidden h-56 w-full sm:block md:h-64">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          {SOURCES.map((s) => (
            <path
              key={s.label}
              className="dash-flow"
              d={inCurve(s.x, s.y)}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {AGENTS.map((a) => (
            <path
              key={a.label}
              className="dash-flow"
              d={outCurve(a.x, a.y)}
              fill="none"
              stroke="var(--rose)"
              strokeOpacity={0.8}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {SOURCES.map((s) => (
          <span
            key={s.label}
            style={at(s.x, s.y)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <Chip label={s.label} tone={s.tone} />
          </span>
        ))}
        <span style={at(CENTER.x, CENTER.y)} className="absolute -translate-x-1/2 -translate-y-1/2">
          <TesseraUnit />
        </span>
        {AGENTS.map((a) => (
          <span
            key={a.label}
            style={at(a.x, a.y)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <Chip label={a.label} tone={a.tone} />
          </span>
        ))}
      </div>

      {/* narrow: vertical flow */}
      <div className="flex flex-col items-center gap-3 sm:hidden">
        <div className="flex flex-wrap justify-center gap-3">
          {SOURCES.map((s) => (
            <Chip key={s.label} label={s.label} tone={s.tone} />
          ))}
        </div>
        <span className="bg-border-strong h-7 w-px" aria-hidden="true" />
        <TesseraUnit />
        <span className="bg-border-strong h-7 w-px" aria-hidden="true" />
        <div className="flex flex-wrap justify-center gap-3">
          {AGENTS.map((a) => (
            <Chip key={a.label} label={a.label} tone={a.tone} />
          ))}
        </div>
      </div>
    </div>
  );
}
