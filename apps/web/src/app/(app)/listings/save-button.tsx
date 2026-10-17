'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/ui';
import { saveListing, type SaveState } from './actions';

export function SaveButton({ jobListingId }: { jobListingId: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveListing, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="jobListingId" value={jobListingId} />
      <button type="submit" disabled={pending || state.saved} className={buttonClass('secondary')}>
        {state.saved ? 'Saved ✓' : pending ? 'Saving…' : 'Save'}
      </button>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
