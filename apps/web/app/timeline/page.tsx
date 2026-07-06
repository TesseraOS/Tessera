import { TimelineView } from '@/components/timeline/timeline-view';

export const metadata = { title: 'Timeline' };

export default function TimelinePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <TimelineView />
    </div>
  );
}
