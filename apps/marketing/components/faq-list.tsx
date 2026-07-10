interface FaqListProps {
  items: ReadonlyArray<{ readonly question: string; readonly answer: string }>;
  /**
   * Shared `name` for the details group — native exclusive-open where supported
   * (progressive enhancement; older engines simply allow multiple open).
   */
  name: string;
}

/**
 * FAQ archetype (MARKETING-DESIGN §3.9, v4.5): native details/summary on hairline
 * cards — no JS accordion. One question opens at a time via the native `name` group;
 * the plus glyph rotates (transform-only micro). Sits in the archetype's right column
 * beside a sticky SectionHeading.
 */
export function FaqList({ items, name }: FaqListProps) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <details
          key={item.question}
          name={name}
          className="group bg-card shadow-soft rounded-lg border px-6"
        >
          <summary className="text-body text-foreground flex cursor-pointer items-center justify-between gap-4 rounded-md py-5 font-medium">
            {item.question}
            <span
              aria-hidden="true"
              className="border-border text-faint-foreground group-open:text-rose inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 group-open:rotate-45"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-3.5"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <p className="text-body text-muted-foreground max-w-xl pb-6">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
