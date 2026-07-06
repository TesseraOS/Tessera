import { SourcesView } from '@/components/sources/sources-view';

export const metadata = { title: 'Sources' };

export default function SourcesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <SourcesView />
    </div>
  );
}
