import { listingDetailSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buttonClass,
  Card,
  formatDate,
  formatSalary,
  PageHeader,
  ScoreBadge,
  SourceLink,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { htmlToBlocks } from '@/lib/html';
import { saveAndOpen } from '../actions';

export default async function ListingPage({ params }: PageProps<'/listings/[id]'>) {
  const { id } = await params;
  const listing = await api(`/listings/${encodeURIComponent(id)}`, listingDetailSchema).catch(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
      throw err;
    },
  );
  const salary = formatSalary(listing.salaryMin, listing.salaryMax);

  return (
    <>
      <Link href="/listings" className="text-sm text-slate-500 hover:underline">
        ← Listings
      </Link>
      <PageHeader title={listing.title}>
        <form action={saveAndOpen}>
          <input type="hidden" name="jobListingId" value={listing.id} />
          <button type="submit" className={buttonClass()}>
            Save &amp; track
          </button>
        </form>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="space-y-3 leading-relaxed">
          {/* Third-party HTML rendered as text: nothing in it can run. */}
          {htmlToBlocks(listing.description).map((block, i) =>
            block.kind === 'bullet' ? (
              <p key={i} className="pl-4 before:-ml-4 before:mr-2 before:content-['•']">
                {block.text}
              </p>
            ) : (
              <p key={i}>{block.text}</p>
            ),
          )}
        </Card>
        <Card className="h-fit space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Your match</span>
            <ScoreBadge score={listing.score} />
          </div>
          <p>{listing.company.name}</p>
          <p className="text-slate-600">{listing.location}</p>
          {salary && <p className="text-slate-600">{salary}</p>}
          <p className="text-slate-500">Posted {formatDate(listing.postedAt)}</p>
          <SourceLink source={listing.source.name} url={listing.url} />
        </Card>
      </div>
    </>
  );
}
