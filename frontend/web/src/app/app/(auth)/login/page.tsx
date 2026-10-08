import { LoginFlow } from './flow';
export const metadata = { title: 'Log in', robots: { index: false } };
export default async function Login({ searchParams }: { searchParams: Promise<{ tenant?: string; next?: string; pick?: string }> }) {
  const sp = await searchParams;
  return <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand/10 to-canvas p-4"><LoginFlow tenant={sp.tenant} next={sp.next} pick={!!sp.pick} /></main>;
}
