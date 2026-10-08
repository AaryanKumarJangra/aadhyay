import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { DomainEvent, EventType } from '@aadhyay/contracts';
import { DbService, Tx } from '../../db/db.service';
import { outboxEvent } from '../../db/schema';
import { Ctx } from '../context/request-context';
import { uuidv7 } from '../../common/ids';

export const META_ON_EVENT = 'aad:on-event';
/** Mark a provider method as a subscriber of one or more domain events. Runs in the worker, inside the tenant context. */
export const OnEvent = (...types: (EventType | '*')[]) => (target: object, key: string | symbol) => {
  Reflect.defineMetadata(META_ON_EVENT, types, target, key);
};

type Handler = { name: string; fn: (e: DomainEvent<any>) => Promise<unknown> };

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly log = new Logger('Outbox');
  private handlers = new Map<string, Handler[]>();
  private running = false;

  constructor(private readonly db: DbService, private readonly discovery: DiscoveryService, private readonly scanner: MetadataScanner, private readonly reflector: Reflector) {}

  onModuleInit() {
    for (const w of this.discovery.getProviders()) {
      const inst = w.instance;
      if (!inst || typeof inst !== 'object') continue;
      const proto = Object.getPrototypeOf(inst);
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const types: string[] | undefined = Reflect.getMetadata(META_ON_EVENT, proto, name);
        if (!types) continue;
        for (const t of types) {
          const list = this.handlers.get(t) ?? [];
          list.push({ name: `${proto.constructor.name}.${name}`, fn: (e) => inst[name](e) });
          this.handlers.set(t, list);
        }
      }
    }
  }

  /**
   * Write an event to the outbox. Uses the active tenant transaction when present, so the event is committed
   * atomically with the data change (transactional outbox).
   */
  async emit<T extends Record<string, unknown>>(type: EventType, data: T, opts: { tenantId?: string | null; tx?: Tx; delayMs?: number } = {}) {
    const ctx = Ctx.maybe();
    const row = {
      id: uuidv7(),
      tenantId: opts.tenantId === undefined ? ctx?.tenantId ?? null : opts.tenantId,
      type,
      payload: data,
      actorUserId: ctx?.userId ?? null,
      availableAt: new Date(Date.now() + (opts.delayMs ?? 0)),
    };
    const exec = opts.tx ?? ctx?.tx ?? this.db.admin;
    await exec.insert(outboxEvent).values(row);
    return row.id;
  }

  /** Claim and process a batch. Returns number processed. Used by the worker loop and by tests. */
  async drain(batch = 50): Promise<number> {
    const res = await this.db.admin.execute(sql`
      UPDATE outbox_events SET status = 'processing', attempts = attempts + 1
      WHERE id IN (SELECT id FROM outbox_events WHERE status = 'pending' AND available_at <= now() ORDER BY id LIMIT ${batch} FOR UPDATE SKIP LOCKED)
      RETURNING id, tenant_id, type, payload, actor_user_id, attempts, created_at`);
    const rows = res.rows as any[];
    for (const r of rows) {
      const ev: DomainEvent = { id: r.id, type: r.type, tenantId: r.tenant_id, occurredAt: new Date(r.created_at).toISOString(), actorUserId: r.actor_user_id, data: r.payload };
      const hs = [...(this.handlers.get(r.type) ?? []), ...(this.handlers.get('*') ?? [])];
      try {
        for (const h of hs) {
          if (ev.tenantId) await Ctx.asTenant(ev.tenantId, () => h.fn(ev), { userId: ev.actorUserId ?? undefined });
          else await Ctx.run({ requestId: 'system', permissions: new Set(['*']) }, () => h.fn(ev));
        }
        await this.db.admin.execute(sql`UPDATE outbox_events SET status = 'done', processed_at = now(), last_error = null WHERE id = ${r.id}`);
      } catch (e: any) {
        const attempts = Number(r.attempts);
        const failed = attempts >= 8;
        const backoffSec = Math.min(3600, 2 ** attempts * 5);
        this.log.warn(`event ${r.type} ${r.id} failed (attempt ${attempts}): ${e?.message}`);
        await this.db.admin.execute(sql`UPDATE outbox_events SET status = ${failed ? 'failed' : 'pending'}, last_error = ${String(e?.message ?? e)}, available_at = now() + make_interval(secs => ${backoffSec}) WHERE id = ${r.id}`);
      }
    }
    return rows.length;
  }

  /** Worker loop. */
  start(intervalMs = 500) {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try {
        while ((await this.drain()) > 0) {}
      } catch (e: any) {
        this.log.error(e?.message);
      }
      setTimeout(tick, intervalMs);
    };
    void tick();
  }
  stop() {
    this.running = false;
  }
  /** Test helper: drain until empty (handlers may emit follow-up events). */
  async drainAll(max = 20) {
    for (let i = 0; i < max; i++) if ((await this.drain()) === 0) return;
  }
}
