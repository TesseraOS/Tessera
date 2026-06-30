import Link from 'next/link';
import { Activity, ArrowRight, Boxes, GitBranch, Network, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

export const metadata = { title: 'Overview' };

const stats = [
  { label: 'Indexed documents', value: '—', footnote: 'Connect a source to begin' },
  { label: 'Memories', value: '—', footnote: 'Decisions, lessons, incidents' },
  { label: 'Effect-links', value: '—', footnote: 'Knowledge-graph edges' },
  { label: 'Sources', value: '0', footnote: 'Filesystem & Git connectors' },
];

const steps = [
  {
    icon: Boxes,
    title: 'Connect a source',
    body: 'Point Tessera at a filesystem path or a Git repository.',
  },
  {
    icon: Network,
    title: 'Ingest & index',
    body: 'Documents are chunked, embedded, and linked into the graph.',
  },
  {
    icon: Search,
    title: 'Search & inspect',
    body: 'Query across everything and inspect compiled context with provenance.',
  },
];

export default function OverviewPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</p>
              <p className="text-muted-foreground text-xs">{stat.footnote}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section
        aria-label="Activity and onboarding"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <p className="text-muted-foreground text-sm">
                Changes and compilations across your connected sources.
              </p>
            </div>
            <GitBranch className="text-muted-foreground size-4" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Once a source is connected and ingested, recent changes and compilations appear here."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/sources">
                    Connect a source
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Get started</CardTitle>
            <p className="text-muted-foreground text-sm">
              Three steps to a working context engine.
            </p>
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
      </section>
    </div>
  );
}
