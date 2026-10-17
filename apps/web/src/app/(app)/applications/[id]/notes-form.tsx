'use client';

import { useActionState } from 'react';
import { buttonClass, ErrorText, inputClass } from '@/components/ui';
import { saveNotes, type NotesState } from '../actions';

export function NotesForm({
  applicationId,
  notes,
}: {
  applicationId: string;
  notes: string | null;
}) {
  const [state, action, pending] = useActionState<NotesState, FormData>(saveNotes, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <textarea
        name="notes"
        rows={5}
        maxLength={5000}
        defaultValue={notes ?? ''}
        className={inputClass}
        aria-label="Notes"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass('secondary')}>
          {pending ? 'Saving…' : 'Save notes'}
        </button>
        {state.saved && !pending && <span className="text-xs text-emerald-700">Saved</span>}
        <ErrorText>{state.error}</ErrorText>
      </div>
    </form>
  );
}
