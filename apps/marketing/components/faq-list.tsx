interface FaqListProps {
  items: ReadonlyArray<{ readonly question: string; readonly answer: string }>;
}

/**
 * FAQ archetype (MARKETING-DESIGN §3.9): native details/summary disclosure with hairline
 * dividers — no JS accordion. The plus glyph rotates on open (transform-only micro).
 */
export function FaqList({ items }: FaqListProps) {
  return (
    <div className="divide-border border-border mt-10 max-w-2xl divide-y border-y">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="text-body text-foreground flex cursor-pointer items-center justify-between gap-4 rounded-md py-5">
            {item.question}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-faint-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-45"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </summary>
          <p className="text-body text-muted-foreground max-w-xl pb-5">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
