import { BillingView } from '@/components/billing/billing-view';

export const metadata = { title: 'Billing' };

export default function BillingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <BillingView />
    </div>
  );
}
