import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

/**
 * Problem band (MARKETING-DESIGN §3.4) — the "why", opening the daylight chapter. Three
 * pains told in the tile language: memory fading, the dump burying signal, the blind edit.
 */

function AmnesiaArt() {
  return (
    <svg
      viewBox="0 0 200 96"
      role="img"
      aria-label="A row of memory tiles fading away session by session"
      className="w-full"
    >
      <g>
        <rect x="8" y="30" width="34" height="34" rx="8" fill="var(--rose)" fillOpacity="0.9" />
        <rect
          x="52"
          y="30"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.55"
        />
        <rect
          x="96"
          y="30"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.28"
        />
        <rect
          x="140"
          y="30"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.12"
        />
        <rect
          x="184"
          y="30"
          width="34"
          height="34"
          rx="8"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
      </g>
      <text x="8" y="86" fill="var(--faint-foreground)" fontSize="10" className="font-mono">
        session 1 → session n
      </text>
    </svg>
  );
}

function DumpArt() {
  return (
    <svg
      viewBox="0 0 200 96"
      role="img"
      aria-label="A container overflowing with disordered context tiles, the signal buried"
      className="w-full"
    >
      <rect
        x="30"
        y="34"
        width="84"
        height="52"
        rx="10"
        fill="none"
        stroke="var(--foreground)"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      {/* disordered spill */}
      <g fill="var(--foreground)">
        <rect
          x="40"
          y="44"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.35"
          transform="rotate(-8 48 52)"
        />
        <rect
          x="62"
          y="40"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.5"
          transform="rotate(12 70 48)"
        />
        <rect
          x="84"
          y="46"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.3"
          transform="rotate(-14 92 54)"
        />
        <rect
          x="50"
          y="62"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.45"
          transform="rotate(6 58 70)"
        />
        <rect
          x="76"
          y="64"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.4"
          transform="rotate(-5 84 72)"
        />
        <rect
          x="58"
          y="18"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.5"
          transform="rotate(18 66 26)"
        />
        <rect
          x="82"
          y="12"
          width="16"
          height="16"
          rx="4"
          fillOpacity="0.35"
          transform="rotate(-20 90 20)"
        />
      </g>
      {/* the one signal tile, buried */}
      <rect x="66" y="52" width="14" height="14" rx="4" fill="var(--rose)" fillOpacity="0.95" />
      <text x="126" y="52" fill="var(--faint-foreground)" fontSize="10" className="font-mono">
        38k tokens,
      </text>
      <text x="126" y="66" fill="var(--faint-foreground)" fontSize="10" className="font-mono">
        one answer
      </text>
    </svg>
  );
}

function BlastArt() {
  return (
    <svg
      viewBox="0 0 200 96"
      role="img"
      aria-label="An edited tile with cracks reaching three dependent tiles nobody saw"
      className="w-full"
    >
      <g
        stroke="var(--rose)"
        strokeOpacity="0.7"
        strokeWidth="1.4"
        fill="none"
        strokeDasharray="3 4"
      >
        <path d="M52 48 L 108 22" />
        <path d="M52 48 L 116 50" />
        <path d="M52 48 L 104 78" />
      </g>
      <rect x="20" y="32" width="32" height="32" rx="8" fill="var(--rose)" fillOpacity="0.9" />
      <g fill="var(--foreground)">
        <rect x="108" y="8" width="26" height="26" rx="6" fillOpacity="0.4" />
        <rect x="116" y="38" width="26" height="26" rx="6" fillOpacity="0.5" />
        <rect x="104" y="66" width="26" height="26" rx="6" fillOpacity="0.35" />
      </g>
      <text x="148" y="52" fill="var(--faint-foreground)" fontSize="10" className="font-mono">
        unseen
      </text>
      <text x="148" y="66" fill="var(--faint-foreground)" fontSize="10" className="font-mono">
        dependents
      </text>
    </svg>
  );
}

const PAINS = [
  {
    title: 'Session amnesia',
    body: 'Every new session starts from zero. Yesterday’s decisions, gone by morning.',
    art: <AmnesiaArt />,
  },
  {
    title: 'The context dump',
    body: 'Pasting whole repositories burns the budget and buries the one line that matters.',
    art: <DumpArt />,
  },
  {
    title: 'The blind edit',
    body: 'Changes ship without knowing what depends on them — CI finds out for you.',
    art: <BlastArt />,
  },
] as const;

export function ProblemBand() {
  return (
    <section
      id="problem"
      data-band="sand"
      aria-labelledby="problem-title"
      className="bg-background text-foreground scroll-mt-16 border-t"
    >
      <Container className="pt-24 pb-4 md:pt-32 md:pb-8">
        <Reveal>
          <SectionHeading
            id="problem-title"
            title="The context problem"
            lead="Coding agents are brilliant for one session and amnesiac for the next — while the context they need sits scattered across repos, ADRs, and heads."
          />
        </Reveal>
        <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
          {PAINS.map((pain, index) => (
            <Reveal
              key={pain.title}
              delay={index * 90}
              className="bg-card shadow-soft rounded-lg border p-6 md:p-7"
            >
              <div className="text-foreground">{pain.art}</div>
              <h3 className="text-heading text-foreground mt-5">{pain.title}</h3>
              <p className="text-body text-muted-foreground mt-2.5">{pain.body}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
