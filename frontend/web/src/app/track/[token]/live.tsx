'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { REALTIME_URL } from '@/lib/config';

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Private live bus page: only this bus, this parent's children's stops and ETA. Link expires with the trip. */
export function LiveTrack({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const bus = useRef<any>(null);

  async function load() {
    const r = await fetch(`/api/v1/public/track/${token}`);
    const j = await r.json();
    if (!r.ok) return setErr(j?.error?.message ?? 'Link expired');
    setData(j);
  }
  useEffect(() => { void load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [token]);
  useEffect(() => {
    const s = io(`${REALTIME_URL}/transport`, { auth: { trackToken: token }, transports: ['websocket'] });
    s.on('trip.position', (p: any) => setData((d: any) => (d ? { ...d, position: p } : d)));
    s.on('trip.event', () => void load());
    return () => { s.close(); };
  }, [token]);
  useEffect(() => {
    if (!data?.position || !mapEl.current) return;
    (async () => {
      const maplibre: any = await import('maplibre-gl');
      const { lng, lat } = data.position;
      if (!map.current) {
        map.current = new maplibre.Map({ container: mapEl.current!, style: { version: 8, sources: { osm: { type: 'raster', tiles: [TILES], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }, center: [lng, lat], zoom: 14 });
        for (const s of data.stops) new maplibre.Marker({ color: '#16a34a' }).setLngLat([s.lng, s.lat]).setPopup(new maplibre.Popup().setText(s.name)).addTo(map.current);
        const el = document.createElement('div');
        el.textContent = '🚌';
        el.style.fontSize = '28px';
        bus.current = new maplibre.Marker({ element: el }).setLngLat([lng, lat]).addTo(map.current);
      } else {
        bus.current.setLngLat([lng, lat]);
        map.current.easeTo({ center: [lng, lat], duration: 800 });
      }
    })();
  }, [data?.position?.lat, data?.position?.lng]);

  if (err) return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="text-4xl">🚌</p><h1 className="mt-3 text-xl font-semibold">{err}</h1><p className="mt-1 text-muted">Tracking links work only during the trip. Open the Aadhyay app to see the bus anytime.</p></div></main>;
  if (!data) return <main className="grid min-h-dvh place-items-center text-muted">Loading live location…</main>;
  const ended = data.status === 'ended';
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="bg-brand px-4 py-3 text-white">
        <p className="text-sm opacity-80">{data.children.map((c: any) => c.firstName).join(' & ')}</p>
        <h1 className="text-lg font-semibold">{data.vehicle?.name ?? 'School bus'} · {data.vehicle?.regNo}</h1>
      </header>
      <div ref={mapEl} className="h-[55dvh] w-full bg-canvas" aria-label="Bus location map" />
      <section className="flex-1 space-y-3 p-4">
        {ended && <p className="rounded-lg bg-canvas p-3 text-sm">This trip has ended.</p>}
        {data.stops.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
            <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted">{s.distanceM !== null ? `${(s.distanceM / 1000).toFixed(1)} km away` : 'Waiting for GPS'}</p></div>
            {!ended && s.etaMin !== null && <div className="text-right"><p className="text-2xl font-bold text-brand tabular">{s.etaMin}</p><p className="text-xs text-muted">min</p></div>}
          </div>
        ))}
        {data.position?.at && <p className="text-center text-xs text-muted">Last update {new Date(data.position.at).toLocaleTimeString('en-IN')}</p>}
      </section>
    </main>
  );
}
