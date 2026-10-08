import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

/** Rendered when the API refuses an action for the signed-in user's role (HTTP 403). */
export default function Forbidden() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-bad/10 text-bad"><ShieldOff className="size-6" aria-hidden /></span>
        <h1 className="mt-4 text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted">Your role doesn&apos;t include permission for this section. If you need it, ask your institution administrator to update your role.</p>
        <Link href="/app" className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Back to dashboard</Link>
      </div>
    </main>
  );
}
