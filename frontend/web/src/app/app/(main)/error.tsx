'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Console error boundary: never a blank screen; offers retry. Details stay in the server log. */
export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-bad/10 text-bad"><AlertTriangle className="size-5" aria-hidden /></span>
      <h2 className="mt-3 text-lg font-semibold">This page couldn&apos;t load</h2>
      <p className="mt-1 text-sm text-muted">Something went wrong while fetching data. It may be a temporary problem.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Ref: {error.digest}</p>}
      <button onClick={reset} className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Try again</button>
    </div>
  );
}
