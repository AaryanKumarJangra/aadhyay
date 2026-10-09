import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/config';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Aadhyay — School ERP, Parent App & Free Secure Messenger', template: '%s | Aadhyay' },
  description: 'All-in-one school, college and coaching software for India: fees, attendance, exams, live bus tracking, website, CRM and a free end-to-end encrypted messenger. 90-day free trial.',
  applicationName: 'Aadhyay',
  openGraph: { type: 'website', siteName: 'Aadhyay', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f7fb' }, { media: '(prefers-color-scheme: dark)', color: '#f6f7fb' }], width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
