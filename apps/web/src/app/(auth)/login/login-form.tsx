'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { buttonClass, ErrorText, inputClass } from '@/components/ui';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
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
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>
      <ErrorText>{state.error}</ErrorText>
      <button type="submit" disabled={pending} className={`${buttonClass()} w-full`}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-sm text-slate-500">
        New here?{' '}
        <Link href="/register" className="text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
