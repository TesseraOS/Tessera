import type React from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps extends React.ComponentProps<'div'> {
  label: string;
  code: string;
}

/**
 * Code showcase (MARKETING-DESIGN §3.6): real, runnable/verifiable content only — never
 * pseudo-code. Header bar carries a mono label; body is preformatted mono.
 */
export const CodeBlock = ({ label, code, className, ...props }: CodeBlockProps) => (
  <div className={cn('bg-code overflow-hidden rounded-lg border', className)} {...props}>
    <div className="bg-card flex h-10 items-center border-b px-4">
      <span className="text-label text-faint-foreground font-mono">{label}</span>
    </div>
    {/* Scrollable on narrow viewports → must be keyboard-reachable and named (WCAG 2.1.1). */}
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
