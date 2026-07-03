import { AuditView } from '@/components/audit/audit-view';

export const metadata = { title: 'Audit log' };

export default function AuditPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <AuditView />
    </div>
  );
}
