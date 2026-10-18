import { savedSearchResponseSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { z } from 'zod';
import { Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { describeFilters } from './describe';

export default async function AlertsPage() {
  const searches = await api('/saved-searches', z.array(savedSearchResponseSchema));
  return (
    <>
      <PageHeader title="Alerts" />
      <p className="-mt-4 mb-6 text-sm text-slate-600">
        New listings that match a saved search appear here once they are scored for you. Save a
        search from the{' '}
        <Link href="/listings" className="text-brand-600 hover:underline">
          listings
        </Link>{' '}
        page.
      </p>
      {searches.length === 0 ? (
        <p className="text-slate-500">No saved searches yet.</p>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => (
            <Link key={s.id} href={`/alerts/${s.id}`} className="block">
              <Card className="flex items-center justify-between gap-4 hover:border-brand-600">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-slate-500">{describeFilters(s.filters)}</p>
                </div>
                {s.newMatches > 0 ? (
                  <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {s.newMatches} new
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">nothing new</span>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
