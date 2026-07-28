'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/error-state';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/lib/api/hooks';
import { t } from '@/lib/i18n';
import { describeNotification, type NotificationKind } from '@/lib/notifications';

/**
 * The order kinds are listed in, and the guarantee that every kind is listed.
 *
 * A literal tuple typed as the full union: adding a kind to the API without adding it here is a
 * **build error**, which is what keeps the settings screen from quietly omitting a toggle for
 * something that is already firing.
 */
const KIND_ORDER = [
  'scan.failed',
  'scan.completed',
  'memory.captured',
  'token.changed',
  'plan.changed',
] as const satisfies readonly NotificationKind[];

/** Kinds worth flagging in the list, so the consequence of muting one is visible before you do it. */
const EMPHASIS: Partial<Record<NotificationKind, string>> = {
  'scan.failed': t('notifications.settings.severityError'),
  'token.changed': t('notifications.settings.severityWarning'),
};

/**
 * Notification preferences (F-065; ADR-0064) — which kinds reach this principal.
 *
 * A **real write surface**, stored server-side: the same preferences the bell filters by and the
 * `list_notifications` MCP tool honours, on every device this person signs in from. Each toggle
 * saves on change (a Save button for five booleans is a step that only exists to be forgotten); a
 * failed save says so and the switch returns to the server's answer, because the query is the source
 * of truth and nothing is written locally.
 */
export function NotificationSettings() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="space-y-1 p-0 pb-3">
        <CardTitle className="text-sm">{t('notifications.settings.title')}</CardTitle>
        <CardDescription>{t('notifications.settings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 p-0">
        {preferences.isPending ? (
          <div aria-hidden="true" className="space-y-3 py-1">
            {KIND_ORDER.map((kind) => (
              <div key={kind} className="flex items-center gap-3">
                <Skeleton className="size-6 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-[1.15rem] w-8 rounded-full" />
              </div>
            ))}
          </div>
        ) : preferences.isError ? (
          <ErrorState
            description={t('notifications.settings.loadFailed')}
            onRetry={() => void preferences.refetch()}
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {KIND_ORDER.map((kind) => {
              const { icon: Icon, title, description } = describeNotification(kind);
              const enabled = preferences.data?.preferences[kind] ?? true;
              const emphasis = EMPHASIS[kind];
              return (
                <li key={kind} className="flex items-center gap-3 py-2.5">
                  <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-md">
                    <Icon className="size-3" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{title}</span>
                      {emphasis !== undefined ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                          {emphasis}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground block text-xs leading-relaxed">
                      {description}
                    </span>
                  </span>
                  <Switch
                    checked={enabled}
                    disabled={update.isPending}
                    // The accessible name is the kind's own title — a row of five switches all
                    // called "Toggle" is unusable with a screen reader.
                    aria-label={title}
                    onCheckedChange={(next) => update.mutate({ [kind]: next })}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {update.isError ? (
          <p role="status" className="text-destructive pt-2 text-xs">
            {t('notifications.settings.saveFailed')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
