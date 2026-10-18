import { savedSearchResponseSchema, searchMatchSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ListingRow } from '@/components/listing-row';
import { buttonClass, formatDate, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { deleteSearch, markSeen } from '../actions';
import { describeFilters, listingsHref } from '../describe';

export default async function SavedSearchPage({ params }: PageProps<'/alerts/[id]'>) {
  const { id } = await params;
  const [searches, matches] = await Promise.all([
    api('/saved-searches', z.array(savedSearchResponseSchema)),
    api(`/saved-searches/${encodeURIComponent(id)}/matches`, z.array(searchMatchSchema)),
  ]).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  });
  const search = searches.find((s) => s.id === id);
  if (!search) notFound();

  return (
    <>
      <Link href="/alerts" className="text-sm text-slate-500 hover:underline">
        ← Alerts
      </Link>
      <PageHeader title={search.name}>
        <div className="flex gap-2">
          {search.newMatches > 0 && (
            <form action={markSeen}>
              <input type="hidden" name="id" value={search.id} />
              <button type="submit" className={buttonClass('secondary')}>
                Mark all seen
              </button>
            </form>
          )}
          <form action={deleteSearch}>
            <input type="hidden" name="id" value={search.id} />
            <button type="submit" className={buttonClass('secondary')}>
              Delete search
            </button>
          </form>
        </div>
      </PageHeader>
      <p className="-mt-4 mb-6 text-sm text-slate-600">
        {describeFilters(search.filters)} ·{' '}
        <Link href={listingsHref(search.filters)} className="text-brand-600 hover:underline">
          see all current listings
        </Link>
      </p>
      {matches.length === 0 ? (
        <p className="text-slate-500">
          No new listings have matched since {formatDate(search.createdAt)}.
        </p>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <ListingRow key={m.listing.id} listing={m.listing}>
              <span
                className={`text-xs ${m.seen ? 'text-slate-400' : 'font-semibold text-brand-600'}`}
              >
                {m.seen ? 'seen' : 'new'} · {formatDate(m.matchedAt)}
              </span>
            </ListingRow>
          ))}
        </div>
      )}
    </>
  );
}
