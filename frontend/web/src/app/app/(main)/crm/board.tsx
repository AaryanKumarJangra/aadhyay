'use client';
import { useState } from 'react';
import { call } from '@/lib/client';
import { Badge } from '@/components/ui';
export function Board({ stages, leads: initial }: { stages: any[]; leads: any[] }) {
  const [leads, setLeads] = useState(initial);
  async function move(id: string, stageId: string) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, stageId } : x)));
    await call(`/crm/leads/${id}`, { method: 'PATCH', body: { stageId } });
  }
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((s) => (
        <section key={s.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(e.dataTransfer.getData('id'), s.id)} className="w-72 shrink-0 rounded-xl border border-line bg-canvas p-3">
          <h2 className="mb-3 flex justify-between text-sm font-semibold">{s.name}<span className="text-muted">{leads.filter((l) => l.stageId === s.id).length}</span></h2>
          <div className="space-y-2">{leads.filter((l) => l.stageId === s.id).map((l) => (
            <article key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData('id', l.id)} className="cursor-grab rounded-lg border border-line bg-surface p-3 text-sm shadow-sm">
              <p className="font-medium">{l.name}</p><p className="text-xs text-muted">{l.phone}{l.forClass ? ` · ${l.forClass}` : ''}</p>
              <div className="mt-2 flex gap-1"><Badge>{l.source}</Badge><Badge tone="brand">score {l.score}</Badge></div>
            </article>
          ))}</div>
        </section>
      ))}
    </div>
  );
}
