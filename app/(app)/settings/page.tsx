import { redirect } from 'next/navigation';
import { SettingsForm } from './settings-form';
import { ShirtTemplatesPanel } from './shirt-templates-panel';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getSettingsForUser } from '@/lib/settings/accessor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const s = await getSettingsForUser(user.id);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initialSettings={s ?? null} />
      <ShirtTemplatesPanel />
    </div>
  );
}
