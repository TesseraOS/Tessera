import { Suspense } from 'react';
import { InspectorView } from '@/components/inspector/inspector-view';

export const metadata = { title: 'Context Package Inspector' };

export default function InspectorPage() {
  return (
    <div className="mx-auto max-w-4xl w-full space-y-4">
      {/* Required, not decorative: InspectorView reads `?task=` via `useSearchParams` (the F-061
          search → compile seed), and Next fails `next build` on a client component that does so
          outside a Suspense boundary. */}
      <Suspense fallback={null}>
        <InspectorView />
      </Suspense>
    </div>
  );
}
