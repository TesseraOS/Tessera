import { BookText, CircleAlert, CircleCheck, CreditCard, KeyRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NotificationPage } from '@tessera/sdk';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * Turning a notification `kind` into something a person can read (F-065; ADR-0064).
 *
 * The API sends **no prose** — deliberately, so the copy can be translated here and an agent reading
 * the same endpoint pays no tokens for a sentence it does not need. This module is therefore the one
 * place a kind becomes a sentence, and every string goes through the catalog.
 */

/** One notification as the API returns it. Derived from the SDK so a schema change is a build error. */
export type Notification = NotificationPage['notifications'][number];
export type NotificationKind = Notification['kind'];
export type NotificationSeverity = Notification['severity'];

/** Icon per kind. Severity is *not* colour-coded here — see `severityToneClass`. */
const ICONS: Record<NotificationKind, LucideIcon> = {
  'memory.captured': BookText,
  'scan.completed': CircleCheck,
  'scan.failed': CircleAlert,
  'token.changed': KeyRound,
  'plan.changed': CreditCard,
};

/**
 * `Record`, not a lookup with a fallback: a kind added to the API becomes a **build error** here
 * rather than a row that silently renders its raw identifier. The catalog keys are checked the same
 * way, because `MessageKey` is a union.
 */
const TITLE_KEYS: Record<NotificationKind, MessageKey> = {
  'memory.captured': 'notifications.kind.memoryCaptured.title',
  'scan.completed': 'notifications.kind.scanCompleted.title',
  'scan.failed': 'notifications.kind.scanFailed.title',
  'token.changed': 'notifications.kind.tokenChanged.title',
  'plan.changed': 'notifications.kind.planChanged.title',
};

const BODY_KEYS: Record<NotificationKind, MessageKey> = {
  'memory.captured': 'notifications.kind.memoryCaptured.body',
  'scan.completed': 'notifications.kind.scanCompleted.body',
  'scan.failed': 'notifications.kind.scanFailed.body',
  'token.changed': 'notifications.kind.tokenChanged.body',
  'plan.changed': 'notifications.kind.planChanged.body',
};

export interface DescribedNotification {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

/** Icon, title, and one line of description for a notification row. Pure — unit-tested directly. */
export function describeNotification(kind: NotificationKind): DescribedNotification {
  return { icon: ICONS[kind], title: t(TITLE_KEYS[kind]), description: t(BODY_KEYS[kind]) };
}

/**
 * The accent colour for a severity, or `null` when it gets none.
 *
 * Only `error` is tinted. `info` is untinted because if the ordinary case is coloured, colour stops
 * meaning anything and a failed scan reads like everything else — and `warning` is untinted because
 * **the design system has no warning token**, and hard-coding an amber here would put a colour
 * outside the token set into a themed surface (tokens-only, DESIGN-SYSTEM.md). Its distinct icon
 * still separates it, which is required anyway: the signal must never depend on colour alone
 * (WCAG 1.4.1). Add the token first if warning ever needs to shout.
 */
export function severityToneClass(severity: NotificationSeverity): string | null {
  return severity === 'error' ? 'text-destructive' : null;
}
