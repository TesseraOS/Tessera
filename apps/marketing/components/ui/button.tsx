import type React from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button (MARKETING-DESIGN §4). The primary CTA is near-white on black — emerald is never
 * a button fill (§2.1 accent budget). CSS-only transitions on specific properties (§5).
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/85',
        secondary: 'bg-secondary text-secondary-foreground hover:border-border-strong border',
        ghost: 'text-muted-foreground hover:text-foreground',
      },
      size: {
        sm: 'text-small h-8 px-3.5',
        md: 'text-small h-10 px-5',
        lg: 'text-body h-11 px-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export const Button = ({ className, variant, size, ...props }: ButtonProps) => (
  <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
);

type ButtonLinkProps = React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>;

/** Link styled as a button — for CTAs that navigate (the common case here). */
export const ButtonLink = ({ className, variant, size, ...props }: ButtonLinkProps) => (
  <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
);
