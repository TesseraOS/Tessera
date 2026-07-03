import { createLocalBilling, type BillingProvider, type CheckoutRequest } from '@tessera/billing';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import { DEFAULT_TENANT_ID, requirePermission } from '../../auth/index.js';
import type { ApiServices } from '../../services.js';
import {
  checkoutBodySchema,
  checkoutResponseSchema,
  plansResponseSchema,
  subscriptionSchema,
  webhookResponseSchema,
  type CheckoutBody,
} from '../../schemas/billing.js';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/v1/billing` — plans, the caller's subscription, checkout, and the provider webhook (F-030). Falls
 * back to the local/free adapter when no billing provider is wired (open-core default), so plans +
 * subscription always answer. Management routes require `admin:manage`; the plan catalog + the
 * signature-verified webhook are public.
 */
export function registerBillingRoutes(app: ZodFastify, services: ApiServices): void {
  const billing: BillingProvider = services.billing ?? createLocalBilling();

  app.get(
    '/billing/plans',
    {
      config: { public: true },
      schema: {
        tags: ['billing'],
        summary: 'List subscription plans and their entitlements.',
        response: { 200: plansResponseSchema },
      },
    },
    () => ({ plans: [...billing.listPlans()] }),
  );

  app.get(
    '/billing/subscription',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['billing'],
        summary: "The calling tenant's current subscription.",
        response: { 200: subscriptionSchema },
      },
    },
    (request) => billing.getSubscription(request.authContext?.tenantId ?? DEFAULT_TENANT_ID),
  );

  app.post<{ Body: CheckoutBody }>(
    '/billing/checkout',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['billing'],
        summary: 'Start a hosted checkout for a paid plan.',
        body: checkoutBodySchema,
        response: { 200: checkoutResponseSchema },
      },
    },
    (request) => {
      const tenantId = request.authContext?.tenantId ?? DEFAULT_TENANT_ID;
      const checkout: CheckoutRequest = {
        tenantId,
        planId: request.body.planId,
        successUrl: request.body.successUrl,
        cancelUrl: request.body.cancelUrl,
        ...(request.body.email !== undefined ? { email: request.body.email } : {}),
      };
      return billing.createCheckout(checkout);
    },
  );

  // The webhook needs the RAW body for signature verification — register it in a child scope with a
  // string JSON parser (encapsulated, so other routes keep normal JSON parsing). Public + verified.
  app.register((instance, _opts, done) => {
    const scoped = instance.withTypeProvider<ZodTypeProvider>();
    scoped.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, cb) => {
      cb(null, body);
    });
    scoped.post(
      '/billing/webhook',
      {
        config: { public: true },
        schema: {
          tags: ['billing'],
          summary: 'Provider billing webhook (signature-verified).',
          response: { 200: webhookResponseSchema },
        },
      },
      async (request) => {
        const rawBody = typeof request.body === 'string' ? request.body : '';
        const signature = firstHeader(
          request.headers['webhook-signature'] ?? request.headers['dodo-signature'],
        );
        const event = await billing.handleWebhook({ rawBody, signature });
        return { received: true, type: event.type };
      },
    );
    done();
  });
}
