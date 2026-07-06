import { SettingsView } from '@/components/settings/settings-view';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <SettingsView />
    </div>
  );
}
