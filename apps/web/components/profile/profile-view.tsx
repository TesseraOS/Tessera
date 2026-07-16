'use client';

import { BadgeCheck, Building2, CreditCard, ShieldCheck, Terminal } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlans, useSubscription } from '@/lib/api/hooks';
import { useSession } from '@/lib/auth/use-session';
import { TokensPanel } from './tokens-panel';
import { MembersCard } from './members-card';

function initialsOf(name: string): string {
  // Drop parentheticals like "(no auth)" and any non-alphanumerics so we never render "(" etc.
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  const first = words[0];
  if (first === undefined) return 'T';
  const last = words[words.length - 1] ?? first;
  const initials = words.length === 1 ? first.slice(0, 2) : `${first[0] ?? ''}${last[0] ?? ''}`;
  return initials.toUpperCase() || 'T';
}

const KIND_LABEL: Record<string, string> = {
  local: 'Local profile',
  token: 'API token',
  user: 'User',
};

/** Account & profile (F-046, FR-65) — identity, access, plan, and (for admins) API tokens + members. */
export function ProfileView() {
  const { identity, status } = useSession();
  const isAdmin = identity?.permissions.includes('admin:manage') ?? false;

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (identity === null) {
    // Offline / unreachable API — the session provider falls back here (never fabricate a profile).
    return (
      <Card className="bg-sidebar border-none p-6 shadow-none dark:ring-0">
        <CardHeader className="p-0">
          <CardTitle>Profile unavailable</CardTitle>
          <CardDescription>
            Your identity is served by the Tessera API. It looks unreachable right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const name = identity.principal.displayName ?? identity.principal.id;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg font-semibold">{initialsOf(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
              <Badge variant="secondary" className="font-normal">
                {KIND_LABEL[identity.principal.kind] ?? identity.principal.kind}
              </Badge>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" aria-hidden="true" />
                Tenant <span className="text-foreground font-mono">{identity.tenantId}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                Principal <span className="text-foreground font-mono">{identity.principal.id}</span>
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Access */}
      <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-3">
          <ShieldCheck className="text-muted-foreground size-4" aria-hidden="true" />
          <CardTitle className="text-sm">Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {identity.principal.roles.map((role) => (
                <Badge key={role} className="capitalize">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">
              Effective permissions ({identity.permissions.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {identity.permissions.map((permission) => (
                <span
                  key={permission}
                  className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-[11px]"
                >
                  {permission}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <PlanCard isAdmin={isAdmin} />

      {/* Agent connectivity — honest, informational (no fabricated data). */}
      <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-2">
          <Terminal className="text-muted-foreground size-4" aria-hidden="true" />
          <CardTitle className="text-sm">Operate from your agent</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground p-0 text-xs leading-relaxed">
          Tessera is agent-first: every operation here — search, compile, effects, memory, sources,
          and token management — is also an <span className="text-foreground">MCP tool</span>, so
          your coding agent can drive Tessera end-to-end. Connect it to the MCP server, or issue a
          scoped API token below for programmatic REST access.
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <TokensPanel />
          <MembersCard />
        </>
      )}
    </div>
  );
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  trialing: 'secondary',
  past_due: 'destructive',
  canceled: 'outline',
};

function formatPrice(priceCents: number, interval: 'month' | 'year' | null): string {
  if (priceCents === 0) return 'Free';
  const amount = (priceCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
  return interval === null ? amount : `${amount} / ${interval}`;
}

function PlanCard({ isAdmin }: { isAdmin: boolean }) {
  const plans = usePlans();
  const subscription = useSubscription(isAdmin);

  const plan =
    subscription.data !== undefined
      ? plans.data?.plans.find((p) => p.id === subscription.data.planId)
      : undefined;

  return (
    <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-4">
        <CreditCard className="text-muted-foreground size-4" aria-hidden="true" />
        <CardTitle className="text-sm">Plan &amp; usage</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {subscription.isPending && isAdmin ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : subscription.data === undefined ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Plan details require the <span className="font-mono">admin:manage</span> permission.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-foreground text-lg font-semibold tracking-tight">
                    {plan?.name ?? subscription.data.planId}
                  </p>
                  <Badge
                    variant={STATUS_VARIANT[subscription.data.status] ?? 'secondary'}
                    className="font-normal capitalize"
                  >
                    {subscription.data.status.replace('_', ' ')}
                  </Badge>
                </div>
                {plan !== undefined && (
                  <p className="text-muted-foreground text-sm">
                    {formatPrice(plan.priceCents, plan.interval)}
                  </p>
                )}
              </div>
              {subscription.data.currentPeriodEnd !== null && (
                <p className="text-muted-foreground text-xs">
                  Renews {new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {plan !== undefined && (
              <dl className="grid grid-cols-3 gap-3">
                <Entitlement label="Compiles / mo" value={plan.entitlements.maxMonthlyCompiles} />
                <Entitlement label="Seats" value={plan.entitlements.maxSeats} />
                <Entitlement
                  label="Tokens / compile"
                  value={plan.entitlements.maxTokensPerCompile}
                />
              </dl>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Entitlement({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border/60 bg-background/40 rounded-lg border p-3">
      <dd className="text-foreground text-lg font-semibold tabular-nums">
        {value < 0 ? 'Unlimited' : value.toLocaleString()}
      </dd>
      <dt className="text-muted-foreground mt-0.5 text-xs">{label}</dt>
    </div>
  );
}
