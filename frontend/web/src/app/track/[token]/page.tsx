import type { Metadata } from 'next';
import { LiveTrack } from './live';
export const metadata: Metadata = { title: 'Live bus tracking', robots: { index: false, follow: false } };
export default async function Track({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LiveTrack token={token} />;
}
