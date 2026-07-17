'use client';

import { ArrowRight, BookText, Boxes, GitBranch, Network, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityFeed } from '@/components/activity-feed';
import { Constellation } from '@/components/art';
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

/** Overview — greeting hero + live stat cards + live activity feed + onboarding (no fabricated data). */
export function Dashboard() {
  // The activity ingest is NOT owned here. It is mounted app-wide in `app/providers.tsx` (F-079):
  // scans are started from /sources, so an Overview-root ingest never saw them. This page only
  // renders the feed the store already holds.
  return (
    <div className="space-y-4">
      <HeroBand />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStats />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none lg:col-span-2 dark:ring-0">
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
      </div>
    </div>
  );
}

/**
 * Greeting hero (DESIGN-SYSTEM §11, ADR-0047) — a welcoming onboarding band, not a metric.
 * Theme-tinted gradient surface, the live Constellation art on the right. Honest: it states
 * what Tessera does, never fabricated numbers.
 */
function HeroBand() {
  return (
    <section
      aria-labelledby="overview-hero-title"
      className="relative overflow-hidden rounded-2xl border p-6 md:p-8"
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--card), color-mix(in oklab, var(--primary) 7%, var(--card)))',
      }}
    >
      <div className="relative z-10 flex flex-col gap-5 md:max-w-md">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wide">
          <Sparkles className="size-3" aria-hidden="true" />
          Context &amp; Memory OS
        </span>
        <div className="space-y-2">
          <h1
            id="overview-hero-title"
            className="text-2xl font-semibold tracking-tight text-balance"
          >
            Give your agents the right context, every time.
          </h1>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty">
            Tessera ingests your code and history, links it into a knowledge graph, and compiles
            token-lean, provenance-tagged context on demand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href="/sources">
              <Boxes className="size-4" />
              Connect a source
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/inspector">
              Try the inspector
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      <div
        className="pointer-events-none absolute top-1/2 right-0 hidden w-[46%] max-w-md -translate-y-1/2 opacity-90 md:block"
        aria-hidden="true"
      >
        <Constellation />
      </div>
    </section>
  );
}
