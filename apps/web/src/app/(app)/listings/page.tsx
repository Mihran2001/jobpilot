import { listingsPageSchema, type ListingSummary } from '@jobpilot/shared';
import Link from 'next/link';
import {
  buttonClass,
  Card,
  formatDate,
  formatSalary,
  inputClass,
  PageHeader,
  ScoreBadge,
  SourceLink,
} from '@/components/ui';
import { api } from '@/lib/api';
import { SaveButton } from './save-button';

const FILTERS = ['q', 'remote', 'minSalary', 'minScore', 'cursor'] as const;

/** Copies only the known filters into a query string for the API. */
function toQuery(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of FILTERS) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') query.set(key, value);
  }
  return query;
}

function ListingRow({ listing }: { listing: ListingSummary }) {
  const salary = formatSalary(listing.salaryMin, listing.salaryMax);
  return (
    <Card className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <ScoreBadge score={listing.score} />
          <Link href={`/listings/${listing.id}`} className="truncate font-medium hover:underline">
            {listing.title}
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          {listing.company.name} · {listing.location}
          {salary && <> · {salary}</>}
        </p>
        <p className="flex gap-3 text-xs text-slate-500">
          <span>Posted {formatDate(listing.postedAt)}</span>
          <SourceLink source={listing.source.name} url={listing.url} />
        </p>
      </div>
      <SaveButton jobListingId={listing.id} />
    </Card>
  );
}

export default async function ListingsPage({ searchParams }: PageProps<'/listings'>) {
  const params = await searchParams;
  const query = toQuery(params);
  const page = await api(`/listings?${query.toString()}`, listingsPageSchema);

  const nextQuery = new URLSearchParams(query);
  if (page.nextCursor) nextQuery.set('cursor', page.nextCursor);
  const firstQuery = new URLSearchParams(query);
  firstQuery.delete('cursor');

  return (
    <>
      <PageHeader title="Listings" />
      {/* A plain GET form: filters live in the URL, so they are shareable and survive reloads. */}
      <form className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5">
        <input
          name="q"
          placeholder="Search title or description"
          defaultValue={query.get('q') ?? ''}
          className={`${inputClass} sm:col-span-2`}
        />
        <input
          name="minScore"
          type="number"
          min={0}
          max={100}
          placeholder="Min score"
          defaultValue={query.get('minScore') ?? ''}
          className={inputClass}
        />
        <input
          name="minSalary"
          type="number"
          min={0}
          step={5000}
          placeholder="Min salary (USD/yr)"
          defaultValue={query.get('minSalary') ?? ''}
          className={inputClass}
        />
        <div className="flex gap-2">
          <select
            name="remote"
            defaultValue={query.get('remote') ?? ''}
            className={inputClass}
            aria-label="Remote"
          >
            <option value="">Any</option>
            <option value="true">Remote</option>
            <option value="false">On-site</option>
          </select>
          <button type="submit" className={buttonClass()}>
            Filter
          </button>
        </div>
      </form>

      {page.items.length === 0 ? (
        <p className="text-slate-500">No listings match these filters.</p>
      ) : (
        <div className="space-y-3">
          {page.items.map((listing) => (
            <ListingRow key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        {query.has('cursor') ? (
          <Link href={`/listings?${firstQuery.toString()}`} className={buttonClass('secondary')}>
            ← First page
          </Link>
        ) : (
          <span />
        )}
        {page.nextCursor && (
          <Link href={`/listings?${nextQuery.toString()}`} className={buttonClass('secondary')}>
            Next page →
          </Link>
        )}
      </div>
    </>
  );
}
