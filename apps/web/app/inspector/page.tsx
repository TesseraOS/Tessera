import { InspectorView } from '@/components/inspector/inspector-view';

export const metadata = { title: 'Context Package Inspector' };

export default function InspectorPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Context Package Inspector</h1>
        <p className="text-muted-foreground text-sm">
          Compile context for a task and inspect what was chosen, why each fragment was included,
          and the full pipeline trace.
        </p>
      </header>
      <InspectorView />
    </div>
  );
}
