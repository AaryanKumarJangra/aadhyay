import type { Metadata } from 'next';
import { SignupForm } from './form';
export const metadata: Metadata = { title: 'Start your 90-day free trial', alternates: { canonical: '/signup' } };
export default function Signup() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <h1 className="text-3xl font-bold">Create your institution</h1>
      <p className="mt-2 text-muted">All features free for 90 days. Your website goes live instantly on a free subdomain.</p>
      <SignupForm />
    </div>
  );
}
