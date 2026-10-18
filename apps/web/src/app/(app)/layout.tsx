import { alertsSummarySchema, userResponseSchema } from '@jobpilot/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { logout } from '../actions';
import { api } from '@/lib/api';

const NAV = [
  { href: '/listings', label: 'Listings' },
  { href: '/applications', label: 'Applications' },
  { href: '/cv-profile', label: 'CV profile' },
  { href: '/settings', label: 'Settings' },
] as const;

/** The unseen-alerts count next to "Alerts"; streams in like the user's email. */
async function AlertsBadge() {
  const { unseen } = await api('/alerts/summary', alertsSummarySchema);
  if (unseen === 0) return null;
  return (
    <span
      className="ml-1 rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white"
      aria-label={`${unseen} new`}
    >
      {unseen}
    </span>
  );
}

async function CurrentUser() {
  const user = await api('/users/me', userResponseSchema);
  return <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>;
}

/** The navigation is static and renders instantly; only the user's email waits for the API. */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/listings" className="font-semibold text-brand-600">
            JobPilot
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-slate-600 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/alerts" className="text-slate-600 hover:text-slate-900">
              Alerts
              <Suspense fallback={null}>
                <AlertsBadge />
              </Suspense>
            </Link>
            <a href="/exports/applications.csv" className="text-slate-600 hover:text-slate-900">
              Export CSV
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={null}>
              <CurrentUser />
            </Suspense>
            <form action={logout}>
              <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
