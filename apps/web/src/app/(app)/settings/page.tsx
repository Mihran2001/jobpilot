import { skillProfileSchema } from '@jobpilot/shared';
import { Card, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { DeleteAccountForm, SkillProfileForm } from './forms';

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const { welcome } = await searchParams;
  const profile = await api('/skill-profile', skillProfileSchema).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

  return (
    <>
      <PageHeader title="Settings" />
      {welcome === '1' && (
        <p className="-mt-2 mb-6 rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Welcome! Tell JobPilot what you know and what you are looking for: every listing gets a
          match score for you.
        </p>
      )}
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-semibold">Skills and requirements</h2>
          <SkillProfileForm profile={profile} />
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-red-800">Delete account</h2>
          <DeleteAccountForm />
        </Card>
      </div>
    </>
  );
}
