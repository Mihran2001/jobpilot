'use client';

import type { SavedSearchFilters } from '@jobpilot/shared';
import Link from 'next/link';
import { useActionState } from 'react';
import { buttonClass, inputClass } from '@/components/ui';
import { saveSearch, type SaveSearchState } from './actions';

export function SaveSearchForm({ filters }: { filters: SavedSearchFilters }) {
  const [state, action, pending] = useActionState<SaveSearchState, FormData>(saveSearch, {});
  if (state.saved) {
    return (
      <p className="mb-6 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        Saved. New listings that match will show up in{' '}
        <Link href="/alerts" className="font-medium underline">
          Alerts
        </Link>
        .
      </p>
    );
  }
  return (
    <form action={action} className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />
      <span className="text-slate-600">Get alerts for these filters:</span>
      <input
        name="name"
        required
        maxLength={60}
        placeholder="Name this search"
        className={`${inputClass} max-w-xs`}
      />
      <button type="submit" disabled={pending} className={buttonClass('secondary')}>
        {pending ? 'Saving…' : 'Save search'}
      </button>
      {state.error && <span className="text-red-700">{state.error}</span>}
    </form>
  );
}
