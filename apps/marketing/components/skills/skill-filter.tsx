import type { CategoryFilter } from '@/lib/skills';

interface SkillFilterProps {
  filters: readonly CategoryFilter[];
}

/**
 * Category filter for the skills catalog (MARKETING-DESIGN §3.15) — a native radio group,
 * zero JavaScript. The inputs are visually hidden but focusable, so arrow keys move
 * between chips exactly as a radio group should; the visible chip is the label, styled off
 * `peer-checked`. The actual show/hide is the `.skill-filter` device in globals.css
 * (§2.3), because `:has()` cannot be expressed in the closed token set.
 *
 * The house precedent is the FAQ: native `details/summary`, never a JS accordion. Same
 * reasoning here — this works before hydration and costs nothing against the first-load
 * budget.
 */
export function SkillFilter({ filters }: SkillFilterProps) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Filter skills by category</legend>
      {filters.map((filter) => (
        <div key={filter.id} className="contents">
          <input
            type="radio"
            name="skill-category"
            id={`skill-category-${filter.id}`}
            value={filter.id}
            defaultChecked={filter.id === 'all'}
            className="peer sr-only"
          />
          <label
            htmlFor={`skill-category-${filter.id}`}
            className="text-label text-muted-foreground hover:text-foreground peer-checked:border-border-strong peer-checked:text-foreground peer-focus-visible:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2"
          >
            {filter.label}
            <span className="text-faint-foreground tabular-nums">{filter.count}</span>
          </label>
        </div>
      ))}
    </fieldset>
  );
}
