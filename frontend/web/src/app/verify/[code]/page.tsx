import type { Metadata } from 'next';
import { API_URL } from '@/lib/config';
import { date } from '@/lib/format';

export const metadata: Metadata = { title: 'Certificate verification', robots: { index: false } };
export default async function Verify({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await fetch(`${API_URL}/v1/public/certificates/verify/${encodeURIComponent(code)}`, { cache: 'no-store' });
  const c = r.ok ? await r.json() : null;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        {c ? (
          <>
            <p className={`text-5xl ${c.valid ? '' : 'grayscale'}`}>{c.valid ? '✅' : '⚠️'}</p>
            <h1 className="mt-4 text-xl font-semibold">{c.valid ? 'Genuine certificate' : 'This certificate was revoked'}</h1>
            <dl className="mt-6 space-y-2 text-left text-sm">
              {[['Institution', c.institution], ['Certificate', c.certificate], ['Issued to', c.holder], ['Reference', c.admissionNo], ['Issued on', date(c.issuedAt)]].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="font-medium">{v ?? '—'}</dd></div>)}
            </dl>
          </>
        ) : (<><p className="text-5xl">❌</p><h1 className="mt-4 text-xl font-semibold">No certificate found</h1><p className="mt-2 text-sm text-muted">Check the code and try again.</p></>)}
        <p className="mt-8 text-xs text-muted">Verified by Aadhyay</p>
      </div>
    </main>
  );
}
