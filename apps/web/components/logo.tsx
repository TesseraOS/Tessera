import { cn } from '@/lib/utils';

/** Tessera mark — a mosaic of tesserae (tiles), echoing the product name. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('text-foreground', className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="9" height="9" rx="2.5" />
      <rect x="13" y="2" width="9" height="9" rx="2.5" opacity="0.45" />
      <rect x="2" y="13" width="9" height="9" rx="2.5" opacity="0.45" />
      <rect x="13" y="13" width="9" height="9" rx="2.5" />
    </svg>
  );
}
