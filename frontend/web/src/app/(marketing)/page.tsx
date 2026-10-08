import Link from 'next/link';
import { jsonLd } from '@/lib/sanitize';
import { Bus, CreditCard, ClipboardCheck, GraduationCap, Globe, Lock, MessageCircle, Phone, ShieldCheck, Users, Video, Wallet } from 'lucide-react';

const FEATURES = [
  { icon: CreditCard, title: 'Fees that collect themselves', body: 'UPI & autopay straight into your bank account, late fees, sibling discounts, thermal receipts, defaulter lists and polite reminders.' },
  { icon: ClipboardCheck, title: 'Attendance in 10 seconds', body: 'Tap absentees only. QR, RFID and face devices supported. Parents get an instant alert — per child.' },
  { icon: Bus, title: 'Live bus tracking', body: 'One private link per parent. Two kids on one bus? One link. Different buses? Separate links. Stop alerts and SOS.' },
  { icon: GraduationCap, title: 'Exams & report cards', body: 'Marks entry offline, ranks, CBSE & Holistic Progress Card formats, results published to the parent app.' },
  { icon: Globe, title: 'Website + SEO included', body: 'Fast, Google-friendly school website on yourschool.aadhyay.com or your own domain. Enquiries go straight to CRM.' },
  { icon: Users, title: 'Admissions CRM', body: 'Every enquiry from website, WhatsApp and walk-ins in one pipeline. One click from lead to admitted student.' },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand/10 to-transparent">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-flex rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">Built for Delhi NCR & West UP schools</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">Run your entire school from one app.</h1>
            <p className="mt-4 text-lg text-muted">Fees, attendance, exams, transport, website, admissions and a <strong className="text-ink">free, end-to-end encrypted messenger</strong> for every parent and teacher. Priced for a 150-student school, powerful enough for a university.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-brand px-6 py-3 font-medium text-white shadow">Start 90-day free trial</Link>
              <Link href="/pricing" className="rounded-lg border border-line bg-surface px-6 py-3 font-medium">See pricing</Link>
            </div>
            <p className="mt-3 text-sm text-muted">No card needed · Setup in 10 minutes · From ₹6 per student per month</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl" aria-hidden>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Today’s attendance', '96.4%'], ['Fees collected (Oct)', '₹8,42,300'], ['Buses live', '6'], ['New enquiries', '23']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-canvas p-4"><div className="text-xs text-muted">{k}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-brand p-4 text-white"><p className="text-xs opacity-80">Parent app · just now</p><p className="mt-1 text-sm">Bus 3 is 5 min from Shastri Nagar Gate for Aarav & Anaya 🚌</p></div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Everything a school needs. Nothing it doesn’t.</h2>
        <p className="mt-2 max-w-2xl text-muted">40+ modules — switch on only what you use and pay only for that.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-xl border border-line bg-surface p-6">
              <f.icon className="h-6 w-6 text-brand" aria-hidden />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="messenger" className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Aadhyay Messenger — free for everyone</h2>
            <p className="mt-3 text-white/70">Chat, voice and video calls with end-to-end encryption. Teachers never share personal numbers. Parents can message anyone — even people not on Aadhyay yet. No WhatsApp group chaos, no cost.</p>
            <ul className="mt-6 space-y-3 text-sm">
              {[[Lock, 'Signal-style end-to-end encryption — even we can’t read your messages'], [Video, 'HD voice & video calls, group calls'], [MessageCircle, 'Class groups, parent–teacher chats with school-set timings'], [Phone, 'Official WhatsApp available as an add-on at Meta’s price']].map(([I, t]: any) => (
                <li key={t} className="flex gap-3"><I className="h-5 w-5 shrink-0 text-accent" aria-hidden /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="grid content-center gap-4">
            <div className="rounded-xl bg-white/10 p-5"><ShieldCheck className="h-6 w-6 text-accent" /><p className="mt-2 font-medium">DPDP-ready, data stored in India</p><p className="text-sm text-white/70">Consent records, data rights console, full export any time.</p></div>
            <div className="rounded-xl bg-white/10 p-5"><Wallet className="h-6 w-6 text-accent" /><p className="mt-2 font-medium">Fee money never touches us</p><p className="text-sm text-white/70">Payments settle directly into your school’s bank account.</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">Try everything free for 90 days</h2>
        <p className="mt-2 text-muted">Pay before day 60 and get 50% off the setup fee.</p>
        <Link href="/signup" className="mt-6 inline-block rounded-lg bg-brand px-8 py-3 font-medium text-white">Create your school account</Link>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Aadhyay', applicationCategory: 'EducationalApplication', operatingSystem: 'Web, Android, iOS', offers: { '@type': 'Offer', price: '6', priceCurrency: 'INR', description: 'Per student per month, plus GST' } }) }} />
    </>
  );
}
