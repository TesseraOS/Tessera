import { Activity, ArrowRight, BookText, Boxes, GitBranch, Network, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none lg:col-span-2 dark:ring-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-0 pb-4">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
              <CardDescription className="text-xs">
                Changes and compilations across your connected sources.
              </CardDescription>
            </div>
            <GitBranch className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-border/70 bg-background/40 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-14 text-center">
              <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl [&_svg]:size-5">
                <Activity aria-hidden="true" />
              </span>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">No activity yet</p>
                <p className="text-muted-foreground mx-auto max-w-sm text-xs leading-relaxed">
                  Connect a filesystem or Git source and Tessera will ingest, index, and record
                  changes, compilations, and effect-link updates here in real time.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button asChild size="sm">
                  <a href="/sources">
                    <Boxes className="size-4" />
                    Connect a source
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/inspector">
                    Compile context
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-semibold">Get started</CardTitle>
            <CardDescription className="text-xs">
              Steps to a working context engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
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
