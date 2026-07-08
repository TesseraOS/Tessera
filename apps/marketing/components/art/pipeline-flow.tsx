import { cn } from '@/lib/utils';

/**
 * PipelineFlow (MARKETING-DESIGN §3.6, ADR-0045 v4.1): sources → the tessera → agents.
 * Labels are HTML chips (real type, truncation-safe, borderless soft fills); only the
 * flowing connectors and the mark itself are SVG. The marching dashes are this band's
 * ambient system, silenced by the global reduced-motion kill-switch.
 */

const SOURCES = [
  { label: 'repos', tone: 'bg-clay' },
  { label: 'decisions', tone: 'bg-gold' },
  { label: 'memory', tone: 'bg-rose' },
] as const;

const AGENTS = [
  { label: 'claude code', tone: 'bg-rose' },
  { label: 'any MCP agent', tone: 'bg-rose' },
] as const;

function ChipColumn({ chips }: { chips: ReadonlyArray<{ label: string; tone: string }> }) {
  return (
    <div className="flex flex-row flex-wrap justify-center gap-3 sm:shrink-0 sm:flex-col sm:justify-center">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="bg-secondary flex max-w-36 items-center gap-2 rounded-md px-3 py-2"
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', chip.tone)} />
          <span className="text-label text-muted-foreground truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Converging/diverging connectors — stretch to fill on wide screens (hairline strokes
 * via non-scaling-stroke); on mobile the row stacks, so they become a quiet vertical tick.
 */
function Connectors({ paths, tone }: { paths: string[]; tone: string }) {
  return (
    <>
      <span className="bg-border-strong h-7 w-px sm:hidden" aria-hidden="true" />
      <div className="relative hidden min-w-8 flex-1 sm:block" aria-hidden="true">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          focusable="false"
        >
          {paths.map((d) => (
            <path
              key={d}
              className="dash-flow"
              d={d}
              fill="none"
              stroke={tone}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
    </>
  );
}

export function PipelineFlow({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Pipeline: repositories, decisions, and memory flow into the tessera, which serves compiled context to coding agents"
      className={cn('w-full', className)}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:gap-4">
        <ChipColumn chips={SOURCES} />

        <Connectors
          tone="var(--border-strong)"
          paths={[
            'M0 18 C 45 18, 55 50, 100 50',
            'M0 50 C 45 50, 55 50, 100 50',
            'M0 82 C 45 82, 55 50, 100 50',
          ]}
        />

        {/* the tessera — mini mosaic with the gilded arrival, soft fills only */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-3">
          <svg viewBox="0 0 116 116" className="size-24 sm:size-28" aria-hidden="true">
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
            <rect x="78" y="-4" width="26" height="26" rx="6" fill="var(--gold)" />
          </svg>
          <p className="text-label text-faint-foreground text-center">
            compiled · budgeted · cited
          </p>
        </div>

        <Connectors
          tone="var(--rose)"
          paths={['M0 50 C 45 50, 55 26, 100 26', 'M0 50 C 45 50, 55 74, 100 74']}
        />

        <ChipColumn chips={AGENTS} />
      </div>
    </div>
  );
}
