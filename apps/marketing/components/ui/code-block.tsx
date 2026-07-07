import type React from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps extends React.ComponentProps<'div'> {
  label: string;
  code: string;
}

/**
 * Code showcase (MARKETING-DESIGN §3.7): real content only. The panel keeps the dusk
 * ground on every band (data-band="dusk") — a dark artifact sitting on sand paper.
 * Scrollable ⇒ keyboard-reachable and named (WCAG 2.1.1).
 */
export const CodeBlock = ({ label, code, className, ...props }: CodeBlockProps) => (
  <div
    data-band="dusk"
    className={cn('bg-code overflow-hidden rounded-lg border', className)}
    {...props}
  >
    <div className="bg-card flex h-10 items-center justify-between border-b px-4">
      <span className="text-label text-muted-foreground font-mono">{label}</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <span className="bg-rose/60 size-2 rounded-full" />
        <span className="bg-gold/60 size-2 rounded-full" />
      </span>
    </div>
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className="text-label text-muted-foreground overflow-x-auto rounded-b-lg p-4 font-mono md:p-5"
    >
      <code>{code}</code>
    </pre>
  </div>
);
