import type { Metadata } from 'next';
import { jsonLd } from '@/lib/sanitize';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CITIES } from '@/lib/cities';

const pretty = (c: string) => c.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
export function generateStaticParams() { return CITIES.map((city) => ({ city })); }
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const name = pretty(city);
  return { title: `School ERP & Parent App in ${name}`, description: `Aadhyay — fees, attendance, exams, bus tracking, website and free secure messenger for schools in ${name}. Local onboarding and support. 90-day free trial.`, alternates: { canonical: `/school-erp/${city}` } };
}
export default async function City({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  if (!CITIES.includes(city)) notFound();
  const name = pretty(city);
  const faq = [
    { q: `Is Aadhyay available for schools in ${name}?`, a: `Yes. We onboard schools in ${name} in person and over video, migrate your data free during the trial, and train your staff in Hindi and English.` },
    { q: 'How much does it cost?', a: 'From ₹6 per student per month plus GST with a low monthly minimum. Small schools under 200 students typically pay around ₹17,000–₹20,000 per year all-inclusive.' },
    { q: 'Do parents need WhatsApp?', a: 'No. Parents get alerts free in the Aadhyay app and can chat with teachers securely. Official WhatsApp is optional for parents who don’t install the app.' },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight">School management software in {name}</h1>
      <p className="mt-4 text-lg text-muted">Private CBSE, ICSE and UP-Board schools in {name} use Aadhyay to collect fees online, send attendance alerts, track school buses live and run their website — all from one app.</p>
      <ul className="mt-8 grid gap-3 md:grid-cols-2">
        {['Fee collection into your own bank account', 'Attendance alerts to parents per child', 'Live bus tracking with stop alerts', 'Report cards (CBSE & HPC)', 'Website on your own domain', 'Free encrypted parent–teacher chat'].map((x) => <li key={x} className="rounded-lg border border-line bg-surface px-4 py-3">✓ {x}</li>)}
      </ul>
      <h2 className="mt-12 text-2xl font-semibold">Frequently asked questions</h2>
      <div className="mt-4 space-y-3">{faq.map((f) => <details key={f.q} className="rounded-lg border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-muted">{f.a}</p></details>)}</div>
      <Link href="/signup" className="mt-10 inline-block rounded-lg bg-brand px-6 py-3 font-medium text-white">Start free trial for your {name} school</Link>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) }} />
    </div>
  );
}
