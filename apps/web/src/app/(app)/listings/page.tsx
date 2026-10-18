import { listingsPageSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { buttonClass, inputClass, PageHeader } from '@/components/ui';
import { ListingRow } from '@/components/listing-row';
import { api } from '@/lib/api';
import { SaveSearchForm } from './save-search-form';
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

      {(['q', 'remote', 'minSalary', 'minScore'] as const).some((k) => query.has(k)) && (
        <SaveSearchForm
          filters={{
            q: query.get('q') ?? undefined,
            remote: query.has('remote') ? query.get('remote') === 'true' : undefined,
            minSalary: query.has('minSalary') ? Number(query.get('minSalary')) : undefined,
            minScore: query.has('minScore') ? Number(query.get('minScore')) : undefined,
          }}
        />
      )}

      {page.items.length === 0 ? (
        <p className="text-slate-500">No listings match these filters.</p>
      ) : (
        <div className="space-y-3">
          {page.items.map((listing) => (
            <ListingRow key={listing.id} listing={listing}>
              <SaveButton jobListingId={listing.id} />
            </ListingRow>
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
