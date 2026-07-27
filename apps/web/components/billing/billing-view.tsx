'use client';

import { CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/error-state';
import { useCheckout, usePlans, useSubscription, useUsage } from '@/lib/api/hooks';

/**
 * Billing (FR-61; F-057) — the plan this tenant is on, what it entitles, how much of it is spent,
 * and (only where it can actually work) the upgrade path.
 *
 * **The upgrade CTA is absent, not disabled, on an unmetered deployment.** A self-hosted operator
 * wired no payments provider, so `POST /v1/billing/checkout` would reject; rendering a button that
 * cannot succeed is worse than rendering none, and a disabled button with no explanation is worse
 * still. The page says what the deployment is instead. `usage.entitlement === null` is the signal —
 * one server-side truth (ADR-0060 §1), not a guess from the plan id.
 */

/** Status → the tone it should read in. `canceled`/`past_due` are warnings, not decorations. */
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  trialing: 'secondary',
  past_due: 'destructive',
  canceled: 'destructive',
};

function formatPrice(cents: number, interval: string | null): string {
  // The ONLY currency this system can honestly print: a plan's own list price, straight from the
  // catalog. Nothing here is derived from usage — there is no per-token price to derive it from.
  if (cents === 0) return interval === null ? 'Free' : 'Contact sales';
  return `$${(cents / 100).toFixed(0)}/${interval ?? 'month'}`;
}

function entitlementLabel(value: number): string {
  return value < 0 ? 'Unlimited' : value.toLocaleString();
}

/** The plan ids checkout accepts. Mirrors `PLAN_IDS` in `@tessera/billing`'s domain. */
const CHECKOUT_PLAN_IDS = ['free', 'pro', 'enterprise'] as const;
type CheckoutPlanId = (typeof CHECKOUT_PLAN_IDS)[number];

/**
 * Narrow a catalog plan id to what checkout accepts.
 *
 * A guard rather than a cast, and not merely to satisfy the compiler: the dashboard's interim `Plan`
 * type declares `id: string` (ADR-0022), so this value genuinely arrives from the wire unvalidated.
 * An unknown id must not reach the request body — a 400 from the API is a worse answer than a button
 * that was never offered.
 */
function isCheckoutPlanId(id: string): id is CheckoutPlanId {
  return (CHECKOUT_PLAN_IDS as readonly string[]).includes(id);
}

function BillingSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-16 w-full" />
      </Card>
    </div>
  );
}

export function BillingView() {
  const plans = usePlans();
  const subscription = useSubscription();
  const usage = useUsage();
  const checkout = useCheckout();

  if (subscription.isPending || usage.isPending) return <BillingSkeleton />;

  if (subscription.isError || subscription.data === undefined) {
    return (
      <ErrorState
        title="Couldn't load your plan"
        description="Billing details require the admin:manage permission."
        onRetry={() => void subscription.refetch()}
      />
    );
  }

  const current = plans.data?.plans.find((plan) => plan.id === subscription.data.planId);
  const entitlement = usage.data?.entitlement ?? null;
  const metered = entitlement !== null;
  const limit = entitlement?.maxMonthlyCompiles ?? -1;
  const used = entitlement?.compilesUsed ?? 0;
  // A bounded percentage: over-limit clamps to 100 rather than overflowing the meter, and an
  // unlimited plan has no meaningful fill at all.
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  // The cheapest paid plan the tenant is not already on. Typed off the catalog rather than widened
  // to `string`, so a plan id that is not in the union cannot reach the checkout body.
  const upgradeTo = plans.data?.plans
    .filter(
      (plan) =>
        plan.priceCents > 0 && plan.id !== subscription.data.planId && isCheckoutPlanId(plan.id),
    )
    .sort((a, b) => a.priceCents - b.priceCents)[0];
  const upgradeToId =
    upgradeTo !== undefined && isCheckoutPlanId(upgradeTo.id) ? upgradeTo.id : undefined;

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-4">
          <CreditCard className="text-muted-foreground size-4" aria-hidden="true" />
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold tracking-tight">
                  {current?.name ?? subscription.data.planId}
                </p>
                <Badge variant={STATUS_VARIANT[subscription.data.status] ?? 'outline'}>
                  {subscription.data.status.replace('_', ' ')}
                </Badge>
              </div>
              {/*
                Suppressed when the price would just repeat the plan's name. Seen on the real page:
                the Free plan rendered "Free" as its title and "Free" again beneath it, which reads
                as a rendering bug rather than as information.
              */}
              {current !== undefined &&
              formatPrice(current.priceCents, current.interval) !== current.name ? (
                <p className="text-muted-foreground text-xs">
                  {formatPrice(current.priceCents, current.interval)}
                </p>
              ) : null}
            </div>
            {subscription.data.currentPeriodEnd !== null ? (
              <div className="text-right">
                <p className="text-muted-foreground text-[11px]">Renews</p>
                <p className="text-sm tabular-nums">
                  {new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            ) : null}
          </div>

          {current !== undefined ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">Compiles / month</dt>
                <dd className="text-sm font-medium tabular-nums">
                  {entitlementLabel(current.entitlements.maxMonthlyCompiles)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Tokens / compile</dt>
                <dd className="text-sm font-medium tabular-nums">
                  {entitlementLabel(current.entitlements.maxTokensPerCompile)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Seats</dt>
                <dd className="text-sm font-medium tabular-nums">
                  {entitlementLabel(current.entitlements.maxSeats)}
                </dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-4">
          <CardTitle>Usage this month</CardTitle>
          <CardDescription>
            {metered
              ? 'Compiles spent against your plan, across every project in this tenant.'
              : 'This deployment is self-hosted and unmetered, so nothing is counted against a plan.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {metered ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-lg font-semibold tabular-nums">
                  {used.toLocaleString()}{' '}
                  <span className="text-muted-foreground text-sm font-normal">
                    of {entitlementLabel(limit).toLowerCase()}
                  </span>
                </p>
                {limit > 0 ? (
                  <p className="text-muted-foreground text-xs tabular-nums">{percent}%</p>
                ) : null}
              </div>
              {limit > 0 ? (
                <Progress
                  value={percent}
                  aria-label={`Compiles used this month: ${String(used)} of ${String(limit)}`}
                />
              ) : null}
              {entitlement !== null ? (
                <p className="text-muted-foreground text-[11px]">
                  Period {entitlement.periodStart} to {entitlement.periodEnd} (UTC).
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Compiles are not capped here. Usage is still recorded, and you can see it under{' '}
              <a className="underline underline-offset-4" href="/analytics">
                Analytics
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/*
        Rendered ONLY on a metered deployment with a paid plan to move to. On self-hosted this whole
        card is absent rather than disabled: checkout would be rejected by the local/free adapter, and
        a button that cannot work is a worse answer than no button.
      */}
      {metered && upgradeTo !== undefined && upgradeToId !== undefined ? (
        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="p-0 pb-4">
            <CardTitle>Change plan</CardTitle>
            <CardDescription>
              Checkout is hosted by our payments provider; you will be redirected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <Button
              onClick={() => {
                checkout.mutate(
                  {
                    planId: upgradeToId,
                    successUrl: `${window.location.origin}/billing?checkout=success`,
                    cancelUrl: `${window.location.origin}/billing?checkout=cancelled`,
                  },
                  { onSuccess: (session) => window.location.assign(session.url) },
                );
              }}
              disabled={checkout.isPending}
            >
              {checkout.isPending ? 'Starting checkout…' : `Upgrade to ${upgradeTo.name}`}
            </Button>
            {/*
              A failed checkout must SAY it failed. Silently doing nothing on click is the failure
              mode this guards against — the user cannot tell a rejected request from a dead button.
            */}
            {checkout.isError ? (
              <ErrorState
                title="Couldn't start checkout"
                description="The payments provider did not return a checkout session. Please try again."
                onRetry={() => checkout.reset()}
                className="p-4"
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
