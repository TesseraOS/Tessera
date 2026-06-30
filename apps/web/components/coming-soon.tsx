import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

/** Placeholder surface for routes a later feature fills in (keeps navigation real). */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState
        icon={Construction}
        title={`${title} is coming soon`}
        description={description ?? 'This surface arrives in a later feature.'}
      />
    </div>
  );
}
