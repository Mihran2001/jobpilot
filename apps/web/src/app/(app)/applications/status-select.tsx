'use client';

import { applicationStatusSchema, type ApplicationStatus } from '@jobpilot/shared';
import { useOptimistic, useState, useTransition } from 'react';
import { STATUS_LABELS } from '@/components/ui';
import { changeStatus } from './actions';

/**
 * Shows the new status immediately (optimistic), then lets the server decide.
 * If the API refuses (e.g. 409: someone else changed it first), the
 * optimistic value is dropped when the transition ends and the message shows.
 */
export function StatusSelect({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ApplicationStatus;
}) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <select
        aria-label="Status"
        value={optimistic}
        disabled={pending}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        onChange={(event) => {
          const next = applicationStatusSchema.parse(event.target.value);
          setError(undefined);
          startTransition(async () => {
            setOptimistic(next);
            const result = await changeStatus(applicationId, next);
            if (result.error) setError(result.error);
          });
        }}
      >
        {applicationStatusSchema.options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
