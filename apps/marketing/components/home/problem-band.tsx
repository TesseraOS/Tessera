import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';

/**
 * Problem band (MARKETING-DESIGN §3.4) — the "why", opening the chapter. Three pains
 * told in the tile language: memory fading, the dump burying signal, the blind edit.
 * Captions are HTML on the type scale (never SVG text — ADR-0045 v4.1).
 */

function AmnesiaArt() {
  return (
    <div>
      <svg
        viewBox="0 0 226 68"
        role="img"
        aria-label="A row of memory tiles fading away session by session"
        className="w-full"
      >
        <rect x="8" y="17" width="34" height="34" rx="8" fill="var(--rose)" fillOpacity="0.9" />
        <rect
          x="52"
          y="17"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.55"
        />
        <rect
          x="96"
          y="17"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.28"
        />
        <rect
          x="140"
          y="17"
          width="34"
          height="34"
          rx="8"
          fill="var(--foreground)"
          fillOpacity="0.12"
        />
        <rect
          x="184"
          y="17"
          width="34"
          height="34"
          rx="8"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
      </svg>
      <p className="text-label text-faint-foreground mt-3">session 1 → session n</p>
    </div>
  );
}

function DumpArt() {
  return (
    <div>
      <svg
        viewBox="0 0 226 68"
        role="img"
        aria-label="A container overflowing with disordered context tiles, the signal buried"
        className="w-full"
      >
        <rect
          x="71"
          y="14"
          width="84"
          height="50"
          rx="10"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
        {/* disordered spill */}
        <g fill="var(--foreground)">
          <rect
            x="81"
            y="24"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.35"
            transform="rotate(-8 88 31)"
          />
          <rect
            x="103"
            y="20"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.5"
            transform="rotate(12 110 27)"
          />
          <rect
            x="125"
            y="26"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.3"
            transform="rotate(-14 132 33)"
          />
          <rect
            x="91"
            y="42"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.45"
            transform="rotate(6 98 49)"
          />
          <rect
            x="117"
            y="44"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.4"
            transform="rotate(-5 124 51)"
          />
          <rect
            x="99"
            y="2"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.5"
            transform="rotate(18 106 9)"
          />
          <rect
            x="121"
            y="0"
            width="15"
            height="15"
            rx="4"
            fillOpacity="0.35"
            transform="rotate(-20 128 7)"
          />
        </g>
        {/* the one signal tile, buried */}
        <rect x="106" y="32" width="13" height="13" rx="4" fill="var(--rose)" fillOpacity="0.95" />
      </svg>
      <p className="text-label text-faint-foreground mt-3">38k tokens, one answer</p>
    </div>
  );
}

function BlastArt() {
  return (
    <div>
      <svg
        viewBox="0 0 226 68"
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
          <path d="M74 34 L 134 10" />
          <path d="M74 34 L 142 36" />
          <path d="M74 34 L 130 58" />
        </g>
        <rect x="42" y="18" width="32" height="32" rx="8" fill="var(--rose)" fillOpacity="0.9" />
        <g fill="var(--foreground)">
          <rect x="134" y="0" width="22" height="22" rx="6" fillOpacity="0.4" />
          <rect x="142" y="26" width="22" height="22" rx="6" fillOpacity="0.5" />
          <rect x="130" y="50" width="22" height="22" rx="6" fillOpacity="0.35" />
        </g>
      </svg>
      <p className="text-label text-faint-foreground mt-3">unseen dependents</p>
    </div>
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
      data-band="chapter"
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
