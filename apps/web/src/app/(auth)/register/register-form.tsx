'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { buttonClass, ErrorText, inputClass } from '@/components/ui';
import { register, type RegisterState } from './actions';

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(register, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Password (at least 12 characters)</span>
        <input
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>
      <ErrorText>{state.error}</ErrorText>
      <button type="submit" disabled={pending} className={`${buttonClass()} w-full`}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
