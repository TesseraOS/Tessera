import { ProfileView } from '@/components/profile/profile-view';

export const metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <ProfileView />
    </div>
  );
}
