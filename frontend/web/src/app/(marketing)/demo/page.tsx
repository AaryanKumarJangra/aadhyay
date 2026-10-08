import { DemoForm } from './form';
export const metadata = { title: 'Book a demo' };
export default function Demo() {
  return <div className="mx-auto max-w-xl px-4 py-14"><h1 className="text-3xl font-bold">Book a free demo</h1><p className="mt-2 text-muted">We visit schools across Delhi NCR & West UP.</p><DemoForm /></div>;
}
