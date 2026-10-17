import { applicationDetailSchema, cvVersionResponseSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Card, formatDate, PageHeader, STATUS_LABELS } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { StatusSelect } from '../status-select';
import { CvPanel } from './cv-panel';
import { NotesForm } from './notes-form';

export default async function ApplicationPage({ params }: PageProps<'/applications/[id]'>) {
  const { id } = await params;
  const safeId = encodeURIComponent(id);
  const [application, versions] = await Promise.all([
    api(`/applications/${safeId}`, applicationDetailSchema),
    api(`/cv-versions?applicationId=${safeId}`, z.array(cvVersionResponseSchema)),
  ]).catch((err: unknown) => {
    // 404 also covers "belongs to someone else": the API does not say which.
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  });

  return (
    <>
      <Link href="/applications" className="text-sm text-slate-500 hover:underline">
        ← Applications
      </Link>
      <PageHeader title={application.listing.title}>
        <div className="w-40">
          <StatusSelect applicationId={application.id} status={application.status} />
        </div>
      </PageHeader>
      <p className="-mt-4 mb-6 text-sm text-slate-600">
        {application.listing.company.name} ·{' '}
        <Link
          href={`/listings/${application.listing.id}`}
          className="text-brand-600 hover:underline"
        >
          view listing
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">CVs</h2>
            <CvPanel applicationId={application.id} versions={versions} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Notes</h2>
            <NotesForm applicationId={application.id} notes={application.notes} />
          </Card>
        </div>
        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">History</h2>
          <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
            {application.events.map((e) => (
              <li key={e.id}>
                <p>
                  {e.fromStatus ? `${STATUS_LABELS[e.fromStatus]} → ` : ''}
                  <span className="font-medium">{STATUS_LABELS[e.toStatus]}</span>
                </p>
                <p className="text-xs text-slate-500">{formatDate(e.createdAt)}</p>
                {e.note && <p className="mt-1 text-slate-600">{e.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
