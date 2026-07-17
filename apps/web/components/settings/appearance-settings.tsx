'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppearanceTransition } from '@/lib/theme';
import {
  THEMES,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEME_SWATCHES,
  type ThemeName,
} from '@/lib/theme-script';
import { cn } from '@/lib/utils';

const MODES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

function originOf(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Appearance settings (DESIGN-SYSTEM §0.1, ADR-0047) — a full theme grid + mode segment,
 * a write surface mirroring the header switcher. Each choice ripples radially from the
 * pressed control. Real, persisted state (not a fake control): the same store as the
 * header and command palette.
 */
export function AppearanceSettings() {
  const { theme, mode, setAppearance } = useAppearanceTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="space-y-1 p-0 pb-3">
        <CardTitle className="text-sm">Appearance</CardTitle>
        <CardDescription>
          Theme and mode for this browser. Switching ripples out from the control you press.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-0">
        <fieldset className="space-y-2.5">
          <legend className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Theme
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEMES.map((name) => {
              const active = mounted && theme === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={(event) => setAppearance({ theme: name }, originOf(event))}
                  className={cn(
                    'group focus-visible:ring-ring relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'border-foreground/40 bg-background'
                      : 'border-border hover:border-foreground/20 hover:bg-background/60',
                  )}
                >
                  <span className="flex items-center justify-between">
                    <ThemePreview name={name} />
                    {active ? <Check className="text-foreground size-3.5" /> : null}
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-xs font-medium">{THEME_LABELS[name]}</span>
                    <span className="text-muted-foreground block text-[10px] leading-tight">
                      {THEME_DESCRIPTIONS[name]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2.5">
          <legend className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Mode
          </legend>
          <div className="bg-background inline-flex items-center gap-1 rounded-lg border p-1">
            {MODES.map(({ value, label, icon: Icon }) => {
              const active = mounted && mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={(event) => setAppearance({ mode: value }, originOf(event))}
                  className={cn(
                    'focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

/** Signature two-disc preview (THEME_SWATCHES — preview affordance, not a component token). */
function ThemePreview({ name }: { name: ThemeName }) {
  const swatch = THEME_SWATCHES[name];
  return (
    <span
      aria-hidden="true"
      className="ring-border flex size-7 items-center justify-center rounded-full ring-1"
      style={{ backgroundColor: swatch.surface }}
    >
      <span className="size-3.5 rounded-full" style={{ backgroundColor: swatch.accent }} />
    </span>
  );
}
