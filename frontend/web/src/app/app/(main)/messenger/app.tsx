'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Send, UserPlus } from 'lucide-react';
import { MessengerClient, type ChatMessage } from '@/lib/messenger/client';
import { call } from '@/lib/client';
import { cx } from '@/lib/format';

export function MessengerApp({ userId }: { userId: string }) {
  const client = useRef<MessengerClient | null>(null);
  const [ready, setReady] = useState(false);
  const [convs, setConvs] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const loadConvs = () => call('/messenger/conversations').then(setConvs);

  useEffect(() => {
    const deviceId = localStorage.getItem('aad_device') ?? (() => { const d = `web-${crypto.randomUUID()}`; localStorage.setItem('aad_device', d); return d; })();
    const c = new MessengerClient(userId, deviceId);
    client.current = c;
    c.init().then(() => setReady(true)).then(loadConvs);
    const off = c.on(async (e) => {
      if (e.type === 'conversation') void loadConvs();
      if (e.type === 'typing') { setTyping(e.data.typing ? e.data.userId : null); }
      if (e.type === 'message' || e.type === 'receipt') setActive((a: any) => { if (a) void c.history(a.id).then(setMsgs); return a; });
    });
    return () => { off(); c.close(); };
  }, [userId]);
  useEffect(() => { if (active && client.current) client.current.history(active.id).then((h) => { setMsgs(h); client.current!.markSeen(active.id, h.filter((m) => !m.mine).map((m) => m.id)); }); }, [active?.id]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs.length]);
  const others = useMemo(() => (active?.members ?? []).filter((m: any) => m.userId && m.userId !== userId), [active, userId]);

  async function send() {
    if (!text.trim() || !active) return;
    const t = text; setText('');
    await client.current!.send(active.id, others.map((m: any) => m.userId), t);
  }
  async function startChat() {
    const c = await call('/messenger/conversations', { body: { kind: 'direct', memberPhones: [newPhone] } });
    setNewPhone(''); await loadConvs(); setActive(c);
    if (c.pendingInvites?.length && navigator.share) navigator.share({ text: c.pendingInvites[0].inviteText }).catch(() => undefined);
  }
  const title = (c: any) => c.title ?? c.members.filter((m: any) => m.userId !== userId).map((m: any) => m.name).join(', ') ?? 'Chat';

  return (
    <div className="grid h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-[300px_1fr]">
      <aside className={cx('flex flex-col border-r border-line', active && 'hidden md:flex')}>
        <div className="border-b border-line p-3">
          <form onSubmit={(e) => { e.preventDefault(); void startChat(); }} className="flex gap-2"><input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Mobile number" className="h-9 flex-1 rounded-lg border border-line px-2 text-sm" /><button className="rounded-lg bg-brand px-3 text-white" aria-label="Start chat"><UserPlus className="h-4 w-4" /></button></form>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" /> End-to-end encrypted · free</p>
        </div>
        <ul className="flex-1 overflow-y-auto">{convs.map((c) => <li key={c.id}><button onClick={() => setActive(c)} className={cx('w-full border-b border-line px-4 py-3 text-left', active?.id === c.id && 'bg-brand/5')}><p className="line-clamp-1 font-medium">{title(c)}</p><p className="text-xs capitalize text-muted">{c.kind}{c.members.some((m: any) => m.pending) ? ' · invited' : ''}</p></button></li>)}</ul>
        {!ready && <p className="p-4 text-sm text-muted">Setting up secure keys on this device…</p>}
      </aside>
      <section className={cx('flex flex-col', !active && 'hidden md:flex')}>
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3"><button className="md:hidden" onClick={() => setActive(null)}>←</button><div><p className="font-semibold">{title(active)}</p><p className="text-xs text-muted">{typing ? 'typing…' : active.kind === 'institution' ? 'School chat · phone numbers hidden' : 'Encrypted'}</p></div></header>
            <div className="flex-1 space-y-2 overflow-y-auto bg-canvas p-4">
              {msgs.map((m) => <div key={m.id} className={cx('max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm', m.mine ? 'ml-auto bg-brand text-white' : 'bg-surface')}>{m.text}<span className={cx('ml-2 text-[10px]', m.mine ? 'text-white/70' : 'text-muted')}>{new Date(m.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{m.mine && (m.status === 'seen' ? ' ✓✓' : m.status === 'delivered' ? ' ✓✓' : ' ✓')}</span></div>)}
              <div ref={bottom} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-line p-3"><input value={text} onChange={(e) => { setText(e.target.value); client.current?.typing(active.id, !!e.target.value); }} placeholder="Message" className="h-11 flex-1 rounded-full border border-line px-4 text-sm" /><button className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white" aria-label="Send"><Send className="h-4 w-4" /></button></form>
          </>
        ) : <div className="grid flex-1 place-items-center text-muted">Select a chat or start one with a mobile number.</div>}
      </section>
    </div>
  );
}
