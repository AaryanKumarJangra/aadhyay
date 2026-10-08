import { api } from '@/lib/server-api';
import { MessengerApp } from './app';
export const metadata = { title: 'Messenger' };
export default async function Messenger() {
  const me = await api('/me');
  return <MessengerApp userId={me.userId} />;
}
