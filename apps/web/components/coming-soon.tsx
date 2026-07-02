import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

/** Placeholder surface for routes a later feature fills in (keeps navigation real). */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12 md:py-20">
      <EmptyState
        icon={Hammer}
        title={`${title} is coming soon`}
        description={description ?? 'This surface arrives in a later release.'}
        className="bg-sidebar w-full max-w-md"
      />
    </div>
  );
}
