import { GraphView } from '@/components/graph/graph-view';

export const metadata = { title: 'Knowledge graph' };

export default function GraphPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <GraphView />
    </div>
  );
}
