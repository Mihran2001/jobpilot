import { Suspense } from 'react';
import { Card } from '@/components/ui';
import { LoginForm } from './login-form';

async function LoginWithNext({
  searchParams,
}: {
  searchParams: PageProps<'/login'>['searchParams'];
}) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === 'string' ? next : '/listings'} />;
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-semibold">JobPilot</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to your job-hunt command center.</p>
        {/* searchParams is request data: it streams in behind a boundary. */}
        <Suspense fallback={<div className="h-48" />}>
          <LoginWithNext searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
