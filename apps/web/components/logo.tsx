import type React from 'react';
import { cn } from '@/lib/utils';

export const LogoIcon = ({ className, ...props }: React.ComponentProps<'svg'>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* Isometric Mosaic Cube (Tessera Brand) */}
    {/* Top Face */}
    <path d="M12 3L19 7L12 11L5 7Z" fill="currentColor" fillOpacity="0.9" />
    {/* Left Face */}
    <path d="M4.5 8.5L11 12.2V19.5L4.5 15.8Z" fill="currentColor" fillOpacity="0.65" />
    {/* Right Face */}
    <path d="M13 12.2L19.5 8.5V15.8L13 19.5Z" fill="currentColor" fillOpacity="0.4" />
  </svg>
);

interface LogoProps extends React.ComponentProps<'div'> {
  iconClassName?: string;
  textClassName?: string;
}

export const Logo = ({ className, iconClassName, textClassName, ...props }: LogoProps) => (
  <div className={cn('flex items-center gap-2.5', className)} {...props}>
    <LogoIcon className={cn('size-6 text-foreground', iconClassName)} />
    <span
      className={cn(
        'font-semibold text-lg tracking-tight text-foreground select-none',
        textClassName,
      )}
    >
      Tessera
    </span>
  </div>
);
