import { cn } from '@/lib/utils';

/**
 * PipelineFlow (MARKETING-DESIGN §3.5): sources → the tessera → agents, told as flowing
 * brand art. The marching dashes are this band's ambient system (CSS `.dash-flow`,
 * reduced-motion-safe via the global kill-switch). Pure SVG, server-rendered.
 */
export function PipelineFlow({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Pipeline: repositories, decisions, and memory flow into the tessera, which serves compiled context to coding agents"
      className={cn('w-full', className)}
    >
      <svg viewBox="0 0 760 240" className="h-auto w-full" aria-hidden="true" focusable="false">
        {/* flows in */}
        <g fill="none" stroke="var(--border-strong)" strokeWidth="1.5">
          <path className="dash-flow" d="M150 60 C 240 60, 260 100, 330 112" />
          <path className="dash-flow" d="M150 120 C 230 120, 250 120, 330 120" />
          <path className="dash-flow" d="M150 180 C 240 180, 260 140, 330 128" />
        </g>
        {/* flows out — the compiled seam, gilded */}
        <g fill="none" strokeWidth="1.5">
          <path className="dash-flow" stroke="var(--rose)" d="M430 114 C 500 106, 520 84, 600 78" />
          <path
            className="dash-flow"
            stroke="var(--rose)"
            d="M430 126 C 500 134, 520 156, 600 162"
          />
        </g>

        {/* source chips */}
        <g>
          <rect
            x="30"
            y="42"
            width="120"
            height="36"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <circle cx="52" cy="60" r="3" fill="var(--clay)" />
          <text x="64" y="64" fill="var(--muted-foreground)" fontSize="12" className="font-mono">
            repos
          </text>
          <rect
            x="30"
            y="102"
            width="120"
            height="36"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <circle cx="52" cy="120" r="3" fill="var(--gold)" />
          <text x="64" y="124" fill="var(--muted-foreground)" fontSize="12" className="font-mono">
            decisions
          </text>
          <rect
            x="30"
            y="162"
            width="120"
            height="36"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <circle cx="52" cy="180" r="3" fill="var(--rose)" />
          <text x="64" y="184" fill="var(--muted-foreground)" fontSize="12" className="font-mono">
            memory
          </text>
        </g>

        {/* the tessera — mini mosaic with the gilded tile */}
        <g transform="translate(330, 74)">
          <rect
            x="-14"
            y="-14"
            width="128"
            height="120"
            rx="14"
            fill="var(--card)"
            stroke="var(--border-strong)"
          />
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
        </g>
        <text
          x="380"
          y="216"
          fill="var(--faint-foreground)"
          fontSize="12"
          textAnchor="middle"
          className="font-mono"
        >
          compiled · budgeted · cited
        </text>

        {/* agent chips */}
        <g>
          <rect
            x="600"
            y="60"
            width="130"
            height="36"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <circle cx="622" cy="78" r="3" fill="var(--rose)" />
          <text x="634" y="82" fill="var(--muted-foreground)" fontSize="12" className="font-mono">
            claude code
          </text>
          <rect
            x="600"
            y="144"
            width="130"
            height="36"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
          />
          <circle cx="622" cy="162" r="3" fill="var(--rose)" />
          <text x="634" y="166" fill="var(--muted-foreground)" fontSize="12" className="font-mono">
            any MCP agent
          </text>
        </g>
      </svg>
    </div>
  );
}
