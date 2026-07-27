import { AnalyticsView } from '@/components/analytics/analytics-view';

export const metadata = { title: 'Analytics' };

export default function AnalyticsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <AnalyticsView />
    </div>
  );
}
