import type { ApplicationStatus } from '@jobpilot/shared';
import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const buttonStyles = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
} as const;

export function buttonClass(variant: keyof typeof buttonStyles = 'primary'): string {
  return `inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]}`;
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        not scored
      </span>
    );
  }
  const tone =
    score >= 75
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 50
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-600';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
      title="Match with your skill profile"
    >
      {score}
    </span>
  );
}

const SOURCE_NAMES: Record<string, string> = { remotive: 'Remotive', jobicy: 'Jobicy' };

/**
 * Attribution required by the sources' terms: name the source and link to
 * the listing on its site.
 */
export function SourceLink({ source, url }: { source: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-brand-600 hover:underline"
    >
      via {SOURCE_NAMES[source] ?? source} ↗
    </a>
  );
}

export function formatSalary(min: number | null, max: number | null): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min !== null && max !== null) return min === max ? `${k(min)}/yr` : `${k(min)}–${k(max)}/yr`;
  if (max !== null) return `up to ${k(max)}/yr`;
  if (min !== null) return `from ${k(min)}/yr`;
  return null;
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {children}
    </p>
  );
}
