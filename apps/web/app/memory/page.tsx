import { MemoryView } from '@/components/memory/memory-view';

export const metadata = { title: 'Memory' };

export default function MemoryPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <MemoryView />
    </div>
  );
}
