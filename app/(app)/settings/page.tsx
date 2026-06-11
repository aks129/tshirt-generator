import { db } from '@/lib/db/client';
import { SettingsForm } from './settings-form';
import { ShirtTemplatesPanel } from './shirt-templates-panel';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const s = await db.query.settings.findFirst();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initialSettings={s ?? null} />
      <ShirtTemplatesPanel />
    </div>
  );
}
