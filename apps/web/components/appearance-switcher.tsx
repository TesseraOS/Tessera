'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

/** Origin (viewport px) of the clicked control — the ripple grows from here. */
function originOf(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Header appearance control (DESIGN-SYSTEM §0.1, ADR-0047): a theme picker (Monkai/Amber/
 * Claude/Notebook, with signature swatches) + a light/dark/system mode segment. Every
 * option ripples the change out radially from itself. Active marks appear after mount to
 * avoid a hydration mismatch (theme/mode are client-resolved).
 */
export function AppearanceSwitcher() {
  const { theme, mode, setAppearance } = useAppearanceTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Change appearance">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Theme
        </DropdownMenuLabel>
        {THEMES.map((name) => {
          const active = mounted && theme === name;
          return (
            <DropdownMenuItem
              key={name}
              onClick={(event) => setAppearance({ theme: name }, originOf(event))}
              className="gap-2.5"
            >
              <ThemeSwatch name={name} />
              <span className="flex flex-1 flex-col">
                <span className="text-sm leading-tight font-medium">{THEME_LABELS[name]}</span>
                <span className="text-muted-foreground text-[11px] leading-tight">
                  {THEME_DESCRIPTIONS[name]}
                </span>
              </span>
              {active ? <Check className="text-foreground size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Mode
        </DropdownMenuLabel>
        {MODES.map(({ value, label, icon: Icon }) => {
          const active = mounted && mode === value;
          return (
            <DropdownMenuItem
              key={value}
              onClick={(event) => setAppearance({ mode: value }, originOf(event))}
              className="gap-2.5"
            >
              <Icon className="text-muted-foreground size-4" />
              <span className="flex-1 text-sm font-medium">{label}</span>
              {active ? <Check className="text-foreground size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Two-disc preview: canvas ring + signature accent (see THEME_SWATCHES — preview only). */
function ThemeSwatch({ name, className }: { name: ThemeName; className?: string }) {
  const swatch = THEME_SWATCHES[name];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ring-border flex size-5 shrink-0 items-center justify-center rounded-full ring-1',
        className,
      )}
      style={{ backgroundColor: swatch.surface }}
    >
      <span className="size-2.5 rounded-full" style={{ backgroundColor: swatch.accent }} />
    </span>
  );
}
