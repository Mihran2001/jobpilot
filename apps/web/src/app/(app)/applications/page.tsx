import { applicationListSchema, applicationStatusSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { formatDate, PageHeader, STATUS_LABELS } from '@/components/ui';
import { api } from '@/lib/api';
import { StatusSelect } from './status-select';

export default async function ApplicationsPage() {
  const { items, counts } = await api('/applications', applicationListSchema);

  return (
    <>
      <PageHeader title="Applications" />
      {items.length === 0 && (
        <p className="mb-6 text-slate-500">
          Nothing tracked yet. Save a listing from the{' '}
          <Link href="/listings" className="text-brand-600 hover:underline">
            listings
          </Link>
          .
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-5">
        {applicationStatusSchema.options.map((status) => (
          <section
            key={status}
            aria-labelledby={`col-${status}`}
            className="rounded-lg bg-slate-100 p-3"
          >
            <h2
              id={`col-${status}`}
              className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700"
            >
              {STATUS_LABELS[status]}
              <span className="rounded-full bg-white px-2 text-xs text-slate-500">
                {counts[status]}
              </span>
            </h2>
            <ul className="space-y-2">
              {items
                .filter((a) => a.status === status)
                .map((a) => (
                  <li
                    key={a.id}
                    className="space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <Link
                      href={`/applications/${a.id}`}
                      className="block text-sm font-medium leading-snug hover:underline"
                    >
                      {a.listing.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {a.listing.company.name} · since {formatDate(a.createdAt)}
                    </p>
                    <StatusSelect applicationId={a.id} status={a.status} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
