import { PLAN_IDS } from '@tessera/billing';
import { z } from 'zod/v4';

/** Billing schemas (F-030) — plans, subscription, checkout. Zod drives validation + OpenAPI. */

const planIdSchema = z.enum(PLAN_IDS);

export const entitlementsSchema = z.object({
  maxMonthlyCompiles: z.number().int(),
  maxSeats: z.number().int(),
  maxTokensPerCompile: z.number().int(),
});

export const planSchema = z.object({
  id: planIdSchema,
  name: z.string(),
  priceCents: z.number().int(),
  interval: z.enum(['month', 'year']).nullable(),
  entitlements: entitlementsSchema,
});

/** `GET /v1/billing/plans` response. */
export const plansResponseSchema = z.object({ plans: z.array(planSchema) });

/** `GET /v1/billing/subscription` response. */
export const subscriptionSchema = z.object({
  tenantId: z.string(),
  planId: planIdSchema,
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']),
  currentPeriodEnd: z.string().nullable(),
  externalId: z.string().optional(),
});

/** `POST /v1/billing/checkout` body. */
export const checkoutBodySchema = z.object({
  planId: planIdSchema,
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  email: z.string().email().optional(),
});

/** `POST /v1/billing/checkout` response — the hosted checkout URL to redirect to. */
export const checkoutResponseSchema = z.object({
  url: z.string(),
  externalId: z.string().optional(),
});

/** `POST /v1/billing/webhook` response. */
export const webhookResponseSchema = z.object({ received: z.boolean(), type: z.string() });

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
