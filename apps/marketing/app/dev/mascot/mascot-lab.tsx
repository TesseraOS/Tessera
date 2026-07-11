'use client';

import { useState } from 'react';
import { CORE_MOODS, MOODS, Mascot, SURFACE_MOODS } from '@tessera/mascot';
import type { MoodName } from '@tessera/mascot';
import { cn } from '@/lib/utils';

const ALL_MOODS: readonly MoodName[] = [...CORE_MOODS, ...SURFACE_MOODS];
const SIZES = [32, 64, 120] as const;

/**
 * The interactive half of the Tess lab: a big reactive specimen with a mood switcher,
 * plus the full registry at three sizes (small-size legibility check included).
 */
export function MascotLab() {
  const [mood, setMood] = useState<MoodName>('idle');
  const [size, setSize] = useState<(typeof SIZES)[number]>(120);

  return (
    <div className="mt-12">
      {/* the specimen — reactive playground */}
      <div className="border-border bg-card/60 grid gap-8 rounded-lg border p-8 md:grid-cols-12">
        <div className="flex items-center justify-center md:col-span-5">
          <Mascot mood={mood} size={200} />
        </div>
        <div className="md:col-span-7">
          <h2 className="text-heading text-foreground">Specimen</h2>
          <p className="text-small text-muted-foreground mt-2">{MOODS[mood].description}</p>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Mood">
            {ALL_MOODS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setMood(name)}
                aria-pressed={mood === name}
                className={cn(
                  'text-label rounded-md border px-3 py-1.5 transition-colors duration-200',
                  mood === name
                    ? 'border-border-strong text-foreground bg-secondary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Grid size">
            {SIZES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSize(value)}
                aria-pressed={size === value}
                className={cn(
                  'text-label rounded-md border px-3 py-1.5 transition-colors duration-200',
                  size === value
                    ? 'border-border-strong text-foreground bg-secondary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {value}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* the registry at the selected size */}
      <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {ALL_MOODS.map((name) => (
          <figure
            key={name}
            className="border-border flex flex-col items-center gap-3 rounded-lg border p-5"
          >
            <Mascot mood={name} size={size} />
            <figcaption className="text-label text-faint-foreground">{name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
