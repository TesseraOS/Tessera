import { createHmac, timingSafeEqual } from 'node:crypto';
import { InternalError, UnauthorizedError, ValidationError } from '@tessera/core';
import {
  freeSubscription,
  listPlans,
  PLAN_IDS,
  type PlanId,
  type Subscription,
  type SubscriptionStatus,
} from '../domain.js';
import type {
  BillingEvent,
  BillingEventType,
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  SubscriptionStore,
} from '../ports.js';

/**
 * The **Dodo Payments** billing adapter (Managed Cloud, ADR-0011). Dodo is a merchant of record
 * (handles global tax/VAT/compliance). Reached via native `fetch` (no SDK — the ADR-0024 dependency
 * ethos). It is **env-guarded** (needs `apiKey` + `webhookSecret`); live API calls are a documented
 * seam (verified against a real Dodo account when the cloud profile ships). The webhook signature +
 * payload mapping here are offline-unit-tested.
 *
 * NOTE: the signature scheme below is a straightforward HMAC-SHA256(hex) over the raw body. Dodo's
 * production webhooks use the Standard Webhooks format; reconcile {@link verifyDodoSignature} with it
 * when wiring the live account.
 */

/** Verify an HMAC-SHA256 (hex) signature over the exact raw body, in constant time. */
export function verifyDodoSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (signature === undefined || signature === '') {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

interface DodoWebhookPayload {
  readonly type?: string;
  readonly data?: {
    readonly subscription_id?: string;
    readonly status?: string;
    readonly current_period_end?: string | null;
    readonly metadata?: { readonly tenant_id?: string; readonly plan_id?: string };
  };
}

const EVENT_TYPE_MAP: Readonly<Record<string, BillingEventType>> = {
  'subscription.active': 'subscription.activated',
  'subscription.activated': 'subscription.activated',
  'subscription.updated': 'subscription.updated',
  'subscription.renewed': 'subscription.updated',
  'subscription.cancelled': 'subscription.canceled',
  'subscription.canceled': 'subscription.canceled',
};

const STATUS_MAP: Readonly<Record<string, SubscriptionStatus>> = {
  active: 'active',
  trialing: 'trialing',
  on_hold: 'past_due',
  past_due: 'past_due',
  cancelled: 'canceled',
  canceled: 'canceled',
  expired: 'canceled',
};

function toPlanId(value: string | undefined): PlanId {
  return (PLAN_IDS as readonly string[]).includes(value ?? '') ? (value as PlanId) : 'free';
}

/** Map a (verified) Dodo webhook body to a {@link BillingEvent}. Throws on unknown/invalid payloads. */
export function parseDodoEvent(rawBody: string): BillingEvent {
  let payload: DodoWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as DodoWebhookPayload;
  } catch {
    throw new ValidationError('invalid webhook JSON');
  }
  const type = payload.type !== undefined ? EVENT_TYPE_MAP[payload.type] : undefined;
  if (type === undefined) {
    throw new ValidationError(`unsupported webhook type: ${String(payload.type)}`);
  }
  const tenantId = payload.data?.metadata?.tenant_id;
  if (tenantId === undefined || tenantId === '') {
    throw new ValidationError('webhook missing metadata.tenant_id');
  }
  const planId = toPlanId(payload.data?.metadata?.plan_id);
  const status: SubscriptionStatus =
    type === 'subscription.canceled'
      ? 'canceled'
      : (STATUS_MAP[payload.data?.status ?? ''] ?? 'active');
  const subscription: Subscription = {
    tenantId,
    planId,
    status,
    currentPeriodEnd: payload.data?.current_period_end ?? null,
    ...(payload.data?.subscription_id !== undefined
      ? { externalId: payload.data.subscription_id }
      : {}),
  };
  return { type, subscription };
}

export interface DodoBillingOptions {
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly store: SubscriptionStore;
  /** Override the Dodo API base URL (tests / sandbox). */
  readonly baseUrl?: string;
  /** Injectable fetch (tests). */
  readonly fetch?: typeof fetch;
}

export function createDodoBilling(options: DodoBillingOptions): BillingProvider {
  const baseUrl = options.baseUrl ?? 'https://api.dodopayments.com';
  const doFetch = options.fetch ?? fetch;

  return {
    id: 'dodo',
    listPlans,

    async getSubscription(tenantId) {
      return (await options.store.get(tenantId)) ?? freeSubscription(tenantId);
    },

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const response = await doFetch(`${baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          product_id: request.planId,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          ...(request.email !== undefined ? { customer: { email: request.email } } : {}),
          // The tenant is echoed back on the subscription webhook so we can attribute it.
          metadata: { tenant_id: request.tenantId, plan_id: request.planId },
        }),
      });
      if (!response.ok) {
        throw new InternalError('dodo checkout request failed');
      }
      const data = (await response.json()) as {
        url?: string;
        payment_link?: string;
        id?: string;
      };
      const url = data.url ?? data.payment_link;
      if (url === undefined) {
        throw new InternalError('dodo checkout returned no url');
      }
      return { url, ...(data.id !== undefined ? { externalId: data.id } : {}) };
    },

    async handleWebhook({ rawBody, signature }) {
      if (!verifyDodoSignature(rawBody, signature, options.webhookSecret)) {
        throw new UnauthorizedError('invalid billing webhook signature');
      }
      const event = parseDodoEvent(rawBody);
      await options.store.upsert(event.subscription);
      return event;
    },
  };
}
