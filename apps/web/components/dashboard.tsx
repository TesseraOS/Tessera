import { Activity, ArrowRight, BookText, Boxes, Network, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { DashboardStats } from '@/components/stats';

const steps = [
  {
    icon: Boxes,
    title: 'Connect a source',
    body: 'Point Tessera at a filesystem path or Git repository to begin ingestion.',
  },
  {
    icon: Network,
    title: 'Ingest & index',
    body: 'Documents are chunked, embedded, and linked into the knowledge graph.',
  },
  {
    icon: Search,
    title: 'Compile context',
    body: 'Run compile tasks to produce token-efficient, provenance-tagged packages.',
  },
  {
    icon: BookText,
    title: 'Capture memories',
    body: 'Record decisions, lessons, and incidents as first-class memory.',
  },
];

/** Overview — Tessera stat cards + honest empty activity + onboarding (no fabricated data). */
export function Dashboard() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStats />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-none bg-sidebar shadow-none lg:col-span-2 dark:ring-0">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>
              Changes and compilations across your connected sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Once a source is connected and ingested, recent changes and compilations appear here."
              className="bg-transparent"
              action={
                <Button asChild size="sm" variant="outline">
                  <a href="/sources">
                    Connect a source
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card className="border-none bg-sidebar shadow-none dark:ring-0">
          <CardHeader>
            <CardTitle className="text-base">Get started</CardTitle>
            <CardDescription>Steps to a working context engine.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <step.icon className="text-muted-foreground size-3.5" aria-hidden="true" />
                      {step.title}
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
