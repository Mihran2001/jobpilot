import type { ListingSummary } from '@jobpilot/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, formatDate, formatSalary, ScoreBadge, SourceLink } from './ui';

/** One listing as a card: used by Listings and by Alerts. `children` go on the right. */
export function ListingRow({
  listing,
  children,
}: {
  listing: ListingSummary;
  children?: ReactNode;
}) {
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
      {children}
    </Card>
  );
}
