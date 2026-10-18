import { Card } from '@/components/ui';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-semibold">Create your JobPilot account</h1>
        <p className="mb-6 text-sm text-slate-500">
          Next, you&apos;ll tell us your skills, so listings can be scored for you.
        </p>
        <RegisterForm />
      </Card>
    </main>
  );
}
