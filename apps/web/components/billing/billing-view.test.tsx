import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getPlans = vi.hoisted(() => vi.fn());
const getSubscription = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
const createCheckout = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getPlans, getSubscription, getUsage, createCheckout },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

import { BillingView } from '@/components/billing/billing-view';

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingView />
    </QueryClientProvider>,
  );
}

const PLANS = {
  plans: [
    {
      id: 'free',
      name: 'Free',
      priceCents: 0,
      interval: null,
      entitlements: { maxMonthlyCompiles: 200, maxSeats: 1, maxTokensPerCompile: 8000 },
    },
    {
      id: 'pro',
      name: 'Pro',
      priceCents: 2900,
      interval: 'month',
      entitlements: { maxMonthlyCompiles: 5000, maxSeats: 10, maxTokensPerCompile: 32000 },
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      priceCents: 0,
      interval: 'month',
      entitlements: { maxMonthlyCompiles: -1, maxSeats: -1, maxTokensPerCompile: 128000 },
    },
  ],
};

const SUBSCRIPTION = {
  tenantId: 'default',
  planId: 'free',
  status: 'active',
  currentPeriodEnd: null,
};

function usage(entitlement: unknown) {
  return {
    from: '2026-05-01',
    until: '2026-05-30',
    totals: {
      compiles: 40,
      searches: 0,
      documentsIngested: 0,
      memoriesWritten: 0,
      tokensCompiled: 0,
    },
    entitlement,
    latency: { compile: null, search: null },
    quality: null,
    daily: [],
  };
}

const METERED = {
  maxMonthlyCompiles: 200,
  compilesUsed: 40,
  periodStart: '2026-05-01',
  periodEnd: '2026-05-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  getPlans.mockResolvedValue(PLANS);
  getSubscription.mockResolvedValue(SUBSCRIPTION);
  getUsage.mockResolvedValue(usage(METERED));
  createCheckout.mockResolvedValue({ url: 'https://pay.example/checkout/abc' });
});

describe('BillingView (F-057; FR-61)', () => {
  it('shows a skeleton while the plan is loading', () => {
    getSubscription.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('surfaces an error when the plan cannot be read', async () => {
    getSubscription.mockRejectedValue(new Error('forbidden'));
    renderView();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/couldn't load your plan/i)).toBeTruthy();
  });

  it('renders the plan, its status, and its entitlements', async () => {
    renderView();
    // ONCE, not twice. Seen on the real page: the Free plan rendered 'Free' as its title and 'Free'
    // again as its price, which reads as a rendering bug rather than as information.
    // Mutation check: dropping the name-equals-price suppression turns this red.
    expect(await screen.findAllByText('Free')).toHaveLength(1);
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('8,000')).toBeTruthy();
  });

  it('shows usage against the limit with an accessible meter', async () => {
    renderView();
    await screen.findByText(/usage this month/i);
    expect(screen.getByText(/of 200/i)).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    // The meter must be readable by a screen reader, not just visible.
    expect(
      screen.getByRole('progressbar', { name: /compiles used this month: 40 of 200/i }),
    ).toBeTruthy();
  });

  it('offers the upgrade only on a metered deployment', async () => {
    renderView();
    expect(await screen.findByRole('button', { name: /upgrade to pro/i })).toBeTruthy();
  });

  it('has NO upgrade control at all on an unmetered deployment', async () => {
    // Absent, not disabled. Checkout would be rejected by the local/free adapter, so a button that
    // cannot succeed is worse than none — and a disabled one with no explanation is worse still.
    // Mutation check: rendering the card regardless of `metered` turns this red.
    getUsage.mockResolvedValue(usage(null));
    renderView();

    expect(await screen.findByText(/self-hosted and unmetered/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /upgrade/i })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('starts checkout through the port and hands the caller the provider URL', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'https://app.example', assign });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /upgrade to pro/i }));

    expect(createCheckout).toHaveBeenCalledWith({
      planId: 'pro',
      successUrl: 'https://app.example/billing?checkout=success',
      cancelUrl: 'https://app.example/billing?checkout=cancelled',
    });
    vi.unstubAllGlobals();
  });

  it('surfaces a checkout failure instead of doing nothing', async () => {
    // The failure mode this guards against is a click that silently does nothing — indistinguishable,
    // to the user, from a dead button. Mutation check: dropping the isError branch turns this red.
    createCheckout.mockRejectedValue(new Error('provider down'));
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /upgrade to pro/i }));
    expect(await screen.findByText(/couldn't start checkout/i)).toBeTruthy();
  });

  it('never renders a usage-derived currency figure', async () => {
    // A plan's own list price is the only money this system can print. Anything computed from usage
    // would be invented — there is no per-token price anywhere in Tessera.
    const { container } = renderView();
    await screen.findByText(/current plan/i);
    const money = container.textContent?.match(/\$[\d,.]+/g) ?? [];
    // `$29/month` is the Pro plan's catalogue price on the upgrade button — allowed. Nothing else.
    expect(money.every((amount) => amount === '$29')).toBe(true);
  });

  it('shows an unlimited plan as unlimited and draws no meter for it', async () => {
    getUsage.mockResolvedValue(usage({ ...METERED, maxMonthlyCompiles: -1, compilesUsed: 12_000 }));
    renderView();

    expect(await screen.findByText(/of unlimited/i)).toBeTruthy();
    // A percentage of infinity is meaningless; the meter is omitted rather than shown at 0 or 100.
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
