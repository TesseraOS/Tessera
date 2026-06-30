import { Activity, Boxes, GitBranch, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ToastDemo } from '@/components/toast-demo';

export const metadata = { title: 'Overview' };

const stats = [
  { label: 'Indexed documents', value: '—', hint: 'Connect a source to begin', icon: Boxes },
  { label: 'Memories', value: '—', hint: 'Decisions, lessons, incidents', icon: Activity },
  { label: 'Effect-links', value: '—', hint: 'Knowledge-graph edges', icon: Network },
  { label: 'Sources', value: '—', hint: 'Filesystem & Git connectors', icon: GitBranch },
];

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm">
          The control panel for your Context &amp; Memory OS. Press{' '}
          <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">⌘K</kbd> to search.
        </p>
      </header>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
              <Icon className="text-muted-foreground size-4" aria-hidden="true" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <p className="text-muted-foreground text-xs">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="Recent activity" className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Badge variant="secondary">Live</Badge>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Once a source is connected and ingested, recent changes and compilations show up here."
              action={<ToastDemo />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loading example</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3" aria-hidden="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
