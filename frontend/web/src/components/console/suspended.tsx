'use client';
export function SuspendedScreen({ canPay, message }: { canPay: boolean; message?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <p className="text-4xl">⏸️</p>
        <h1 className="mt-3 text-xl font-semibold">{canPay ? 'Subscription expired' : 'Service paused'}</h1>
        <p className="mt-2 text-sm text-muted">{message ?? (canPay ? 'Renew to restore everything instantly. Your data is safe.' : 'Please contact your institution administrator.')}</p>
        {canPay && <div className="mt-6 flex justify-center gap-3"><a href="/app/billing" className="rounded-lg bg-brand px-5 py-2.5 text-white">Pay now</a><button onClick={async () => { const r = await fetch('/api/v1/compliance/export', { method: 'POST' }); const j = await r.json(); if (j.url) location.href = j.url; }} className="rounded-lg border border-line px-5 py-2.5">Export data</button></div>}
      </div>
    </main>
  );
}
