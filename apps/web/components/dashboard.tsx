'use client';

import { BookText, Boxes, GitBranch, Network, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityFeed } from '@/components/activity-feed';
import { Constellation } from '@/components/art';
import { DashboardStats } from '@/components/stats';
import { useStats } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

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

/**
 * Overview — live stat cards + live activity feed, with onboarding **only while it is true**
 * (ADR-0053).
 *
 * The greeting hero band that opened this page until F-080 is gone: it was marketing copy behind a
 * login, and it pushed the numbers — the page's actual job — below the fold. ADR-0047 sanctioned it
 * as onboarding, but onboarding is conditional and the band was not. The onboarding value now lives
 * in one place, the "Get started" card, which appears exactly when it is useful.
 */
export function Dashboard() {
  const { data } = useStats();

  // Onboard only when the workspace is genuinely, provably empty.
  //
  // `data === undefined` (loading, or the request failed) means "we do not know yet" — which must
  // never render as "you have nothing", the same distinction the stat cards draw by showing '—'
  // rather than 0. So an unknown workspace shows no onboarding rather than guessed onboarding.
  //
  // NOT gated on the activity feed, which is the intuitive reading of "hide it once there's
  // activity" and is wrong: that feed is session-only by design (`lib/store/notifications`), so it
  // is empty after every reload and this card would greet an established user forever.
  //
  // `useStats` invalidates itself on `source.scan.completed`, so this resolves on its own the
  // moment the first documents land — no refresh, no manual wiring.
  const onboarding = data !== undefined && data.sources === 0 && data.documents === 0;

  return (
    <div className="space-y-4">
      {/* The page's heading. The hero's h1 left with it, and the breadcrumb header is a landmark,
          not a heading — so this keeps the route announceable without re-adding a visual band. */}
      <h1 className="sr-only">Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStats />
      </div>

      <div className={cn('grid grid-cols-1 gap-4', onboarding && 'lg:grid-cols-3')}>
        <Card
          className={cn(
            'bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0',
            onboarding && 'lg:col-span-2',
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-0 pb-4">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
              <CardDescription className="text-xs">
                Changes and compilations across your connected sources, live this session.
              </CardDescription>
            </div>
            <GitBranch className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            <ActivityFeed />
          </CardContent>
        </Card>

        {onboarding ? <GetStarted /> : null}
      </div>
    </div>
  );
}

/**
 * First-run onboarding. Renders only for a provably empty workspace — which is what earns it the
 * illustration under DESIGN-SYSTEM §11's budget: "onboarding/first-run" is a sanctioned art surface,
 * and this card is now the Overview's only one (ADR-0053 retired the hero band it used to sit in).
 */
function GetStarted() {
  return (
    <Card className="bg-sidebar relative gap-0 overflow-hidden border-none p-4 shadow-none dark:ring-0">
      <div
        className="pointer-events-none absolute -top-8 -right-10 w-48 opacity-[0.18]"
        aria-hidden="true"
      >
        <Constellation />
      </div>

      <CardHeader className="relative z-10 p-0 pb-4">
        <CardTitle className="text-sm font-semibold">Get started</CardTitle>
        <CardDescription className="text-xs">Steps to a working context engine.</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 p-0">
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="group flex gap-3">
              <span className="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors">
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
  );
}
