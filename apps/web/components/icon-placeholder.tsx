import * as Lucide from 'lucide-react';
import type { ComponentProps } from 'react';

export type IconPlaceholderProps = ComponentProps<'svg'> & {
  lucide?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
  tabler?: string;
};

export function IconPlaceholder({
  lucide,
  hugeicons,
  phosphor,
  remixicon,
  tabler,
  ...props
}: IconPlaceholderProps) {
  if (!lucide) return null;

  // Try direct lookup (e.g. MailIcon or Mail)
  let IconComponent = (Lucide as any)[lucide];

  // If not found, try stripping the "Icon" suffix
  if (!IconComponent && lucide.endsWith('Icon')) {
    const stripped = lucide.slice(0, -4);
    IconComponent = (Lucide as any)[stripped];
  }

  // Handle name differences if any
  if (!IconComponent) {
    if (lucide === 'HelpCircleIcon') {
      IconComponent = Lucide.HelpCircle || Lucide.HelpCircleIcon;
    } else if (lucide === 'BarChart3Icon') {
      IconComponent = Lucide.BarChart3 || Lucide.BarChart || Lucide.ChartBar;
    }
  }

  if (!IconComponent) {
    // Fallback icon if lookup fails
    IconComponent = Lucide.HelpCircle || Lucide.HelpCircleIcon;
  }

  return <IconComponent {...props} />;
}
