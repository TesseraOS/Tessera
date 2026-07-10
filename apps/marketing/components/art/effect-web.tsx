import type React from 'react';

/**
 * EffectWeb (MARKETING-DESIGN §3.7, ADR-0045 v4.1): get_effects as brand art — an edit
 * reaches a contract, and the impact ripples through direct and transitive dependents.
 * Pure SVG edges (flowing dashes, theme tokens) under HTML chips (real type, ellipsis
 * truncation) positioned on the same 640×360 grid, so alignment holds at every width.
 * Server-rendered; motion is the CSS dash flow, silenced by the global kill-switch.
 */

const W = 640;
const H = 360;

interface Chip {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: 'edit' | 'hub' | 'direct' | 'transitive';
}

const CHIPS: Chip[] = [
  { id: 'edit', label: 'edit', x: 40, y: 180, kind: 'edit' },
  { id: 'contract', label: 'TokenStore', x: 168, y: 180, kind: 'hub' },
  { id: 'd1', label: 'refresh.ts', x: 342, y: 48, kind: 'direct' },
  { id: 'd2', label: 'api/session.ts', x: 342, y: 180, kind: 'direct' },
  { id: 'd3', label: 'sdk/client.ts', x: 342, y: 312, kind: 'direct' },
  { id: 't1', label: 'worker/sync.ts', x: 566, y: 24, kind: 'transitive' },
  { id: 't2', label: 'app/login.tsx', x: 566, y: 128, kind: 'transitive' },
  { id: 't3', label: 'cli/auth.ts', x: 566, y: 232, kind: 'transitive' },
  { id: 't4', label: 'session.spec.ts', x: 566, y: 336, kind: 'transitive' },
];

const EDGES: Array<{ from: string; to: string; tone: 'quiet' | 'impact' }> = [
  { from: 'edit', to: 'contract', tone: 'quiet' },
  { from: 'contract', to: 'd1', tone: 'impact' },
  { from: 'contract', to: 'd2', tone: 'impact' },
  { from: 'contract', to: 'd3', tone: 'impact' },
  { from: 'd1', to: 't1', tone: 'impact' },
  { from: 'd2', to: 't2', tone: 'impact' },
  { from: 'd2', to: 't3', tone: 'impact' },
  { from: 'd3', to: 't4', tone: 'impact' },
];

const at = (id: string) => {
  const chip = CHIPS.find((c) => c.id === id);
  return chip ? { x: chip.x, y: chip.y } : { x: 0, y: 0 };
};

const curve = (from: string, to: string) => {
  const a = at(from);
  const b = at(to);
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

const chipStyle = (chip: Chip): React.CSSProperties => ({
  left: `${(chip.x / W) * 100}%`,
  top: `${(chip.y / H) * 100}%`,
});

export function EffectWeb() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <div
        role="img"
        aria-label="An edit reaches the TokenStore contract; the impact web lights up three direct dependents and four transitive ones behind them"
        className="relative aspect-video w-full"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          {EDGES.map((edge) => (
            <path
              key={`${edge.from}-${edge.to}`}
              className={edge.tone === 'impact' ? 'dash-flow' : undefined}
              d={curve(edge.from, edge.to)}
              fill="none"
              stroke={edge.tone === 'impact' ? 'var(--rose)' : 'var(--border-strong)'}
              strokeOpacity={edge.tone === 'impact' ? 0.75 : 1}
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {CHIPS.map((chip) => (
          <span
            key={chip.id}
            style={chipStyle(chip)}
            className={
              chip.kind === 'hub'
                ? 'bg-card border-border-strong absolute flex max-w-48 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-md border px-2.5 py-1.5'
                : 'bg-card/90 absolute flex max-w-36 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-md border px-2 py-1'
            }
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${
                chip.kind === 'hub' ? 'bg-gold' : chip.kind === 'edit' ? 'bg-clay' : 'bg-rose'
              }`}
            />
            <span
              className={`text-label truncate ${
                chip.kind === 'hub' ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {chip.label}
            </span>
          </span>
        ))}
      </div>

      <p className="text-label text-faint-foreground mt-4">
        get_effects → 7 dependents · before the edit ships
      </p>
    </div>
  );
}
