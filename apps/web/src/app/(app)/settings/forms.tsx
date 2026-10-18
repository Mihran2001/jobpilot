'use client';

import type { SkillProfileInput } from '@jobpilot/shared';
import { useActionState } from 'react';
import { buttonClass, ErrorText, inputClass } from '@/components/ui';
import { deleteAccount, saveSkillProfile, type SettingsState } from './actions';

export function SkillProfileForm({ profile }: { profile: SkillProfileInput | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSkillProfile, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Skills (one per line)</span>
          <textarea
            name="skills"
            rows={8}
            defaultValue={profile?.skills.join('\n')}
            placeholder={'TypeScript\nReact\nNode.js'}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Roles you want (one per line)</span>
          <textarea
            name="preferredRoles"
            rows={8}
            defaultValue={profile?.preferredRoles.join('\n')}
            placeholder={'Full-Stack Engineer\nBackend Engineer'}
            className={inputClass}
          />
        </label>
      </div>
      <label className="block max-w-xs space-y-1">
        <span className="text-sm font-medium">Minimum salary (USD per year, optional)</span>
        <input
          name="minSalary"
          type="number"
          min={1}
          step={1000}
          defaultValue={profile?.minSalary ?? ''}
          className={inputClass}
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass()}>
          {pending ? 'Saving…' : 'Save and rescore'}
        </button>
        {state.saved && !pending && (
          <span className="text-sm text-emerald-700">
            Saved. Scores update in the background within a minute.
          </span>
        )}
        <ErrorText>{state.error}</ErrorText>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-600">
        Deletes your account, applications, history, scores, saved searches, and every CV file. This
        cannot be undone.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Your password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Type DELETE to confirm</span>
          <input name="confirm" required className={inputClass} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:bg-slate-300"
        >
          {pending ? 'Deleting…' : 'Delete my account'}
        </button>
        <ErrorText>{state.error}</ErrorText>
      </div>
    </form>
  );
}
