import type { PlanId, Plan, Subscription } from './domain.js';

/**
 * Billing ports (ADR-0011/0031). `BillingProvider` abstracts the payments provider so Local/Self-Hosted
 * have a no-external-deps adapter and Managed Cloud uses Dodo — swappable behind one interface
 * (ADR-0003). `SubscriptionStore` persists provider-driven subscription state (updated by webhooks).
 */

export interface CheckoutRequest {
  readonly tenantId: string;
  readonly planId: PlanId;
  /** Where the provider redirects after a successful/canceled checkout. */
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Optional principal/customer email to prefill. */
  readonly email?: string;
}

export interface CheckoutSession {
  /** The hosted checkout URL to redirect the customer to. */
  readonly url: string;
  readonly externalId?: string;
}

export type BillingEventType =
  'subscription.activated' | 'subscription.updated' | 'subscription.canceled';

export interface BillingEvent {
  readonly type: BillingEventType;
  readonly subscription: Subscription;
}

/** A raw provider webhook to verify + apply. */
export interface WebhookInput {
  /** The exact request body bytes (as text) — signatures are computed over these, not a re-serialization. */
  readonly rawBody: string;
  /** The provider signature header, if present. */
  readonly signature: string | undefined;
}

export interface BillingProvider {
  /** Stable adapter id (`'local'` | `'dodo'`). */
  readonly id: string;
  /** The plan catalog (same for every adapter — pricing is product config, not provider state). */
  listPlans(): readonly Plan[];
  /** The tenant's current subscription (falls back to a free subscription when none). */
  getSubscription(tenantId: string): Promise<Subscription>;
  /** Start a hosted checkout for a paid plan. Not available on the local adapter. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Verify + parse a provider webhook, apply it to the store, and return the event. */
  handleWebhook(input: WebhookInput): Promise<BillingEvent>;
}

/** Persistence for provider-driven subscriptions (one current subscription per tenant). */
export interface SubscriptionStore {
  get(tenantId: string): Promise<Subscription | null>;
  upsert(subscription: Subscription): Promise<void>;
}
