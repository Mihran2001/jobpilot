import { cvProfileSchema } from '@jobpilot/shared';
import { PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { CvProfileForm } from './cv-profile-form';

export default async function CvProfilePage() {
  // 404 just means "not filled in yet": start with an empty form.
  const profile = await api('/cv-profile', cvProfileSchema).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  return (
    <>
      <PageHeader title="CV profile" />
      <p className="-mt-4 mb-6 text-sm text-slate-600">
        Every tailored CV starts from this. Tailoring only reorders it for each listing; it never
        adds or rewrites anything.
      </p>
      <CvProfileForm initial={profile} />
    </>
  );
}
