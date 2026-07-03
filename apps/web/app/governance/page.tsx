import { GovernanceView } from '@/components/governance/governance-view';

export const metadata = { title: 'Governance' };

export default function GovernancePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <GovernanceView />
    </div>
  );
}
