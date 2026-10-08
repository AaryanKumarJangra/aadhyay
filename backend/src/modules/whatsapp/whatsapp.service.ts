import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { waAccount, waTemplate, waFlow, waConversation, waMessage, messageDelivery, lead, tenantModule } from '../../db/schema';
import { WhatsAppAdapter, WaCreds } from '../../adapters/whatsapp/whatsapp.adapter';
import { BillingService } from '../../control-plane/billing.service';
import { waMessagePrice } from '../../control-plane/pricing';
import { encrypt, decrypt } from '../../common/crypto';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { AppError, badRequest, notFound } from '../../common/errors';

type Category = 'marketing' | 'utility' | 'authentication' | 'service';

@Injectable()
export class WhatsAppService {
  private readonly log = new Logger('WhatsAppService');
  constructor(private readonly db: DbService, private readonly wa: WhatsAppAdapter, private readonly billing: BillingService, private readonly events: EventsService) {}

  async connect(b: { wabaId: string; phoneNumberId: string; displayPhone: string; accessToken: string; verifiedName?: string }) {
    const tenantId = Ctx.tenantId();
    const [r] = await this.db.admin.insert(waAccount).values({ tenantId, wabaId: b.wabaId, phoneNumberId: b.phoneNumberId, displayPhone: b.displayPhone, verifiedName: b.verifiedName, tokenEnc: encrypt(b.accessToken) })
      .onConflictDoUpdate({ target: waAccount.phoneNumberId, set: { tokenEnc: encrypt(b.accessToken), displayPhone: b.displayPhone, status: 'connected', tenantId } }).returning();
    await this.db.admin.insert(tenantModule).values({ tenantId, moduleKey: 'whatsapp', enabled: true, source: 'addon' }).onConflictDoUpdate({ target: [tenantModule.tenantId, tenantModule.moduleKey], set: { enabled: true } });
    return { id: r!.id, displayPhone: r!.displayPhone, status: r!.status };
  }

  async account(tenantId = Ctx.tenantId()) {
    const [a] = await this.db.admin.select().from(waAccount).where(and(eq(waAccount.tenantId, tenantId), eq(waAccount.status, 'connected'))).limit(1);
    return a ?? null;
  }
  creds(a: typeof waAccount.$inferSelect): WaCreds {
    return { phoneNumberId: a.phoneNumberId, token: decrypt(a.tokenEnc), wabaId: a.wabaId };
  }

  private async conversationFor(tenantId: string, accountId: string, phone: string, name?: string) {
    const [c] = await this.db.admin.insert(waConversation).values({ tenantId, accountId, contactPhone: phone, contactName: name })
      .onConflictDoUpdate({ target: [waConversation.accountId, waConversation.contactPhone], set: { updatedAt: new Date() } }).returning();
    return c!;
  }

  /**
   * Send an approved template, debiting the prepaid wallet (Meta rate + Aadhyay fee, ex-GST).
   * Returns null (not sent) when the tenant has no WhatsApp Channel, the template isn't approved, or the wallet is empty
   * — callers fall back to free channels.
   */
  async sendTemplate(tenantId: string, to: string, name: string, params: string[], category: Category, ref?: { notificationId?: string; userId?: string }) {
    const acc = await this.account(tenantId);
    if (!acc) return null;
    const [tpl] = await this.db.admin.select().from(waTemplate).where(and(eq(waTemplate.tenantId, tenantId), eq(waTemplate.name, name))).limit(1);
    if (!tpl || tpl.status !== 'approved') return null;
    const { items } = await this.billing.book();
    const price = waMessagePrice(tpl.category, items);
    const ok = await this.billing.debitUsage(tenantId, `wa_${tpl.category}`, 1, price.pricePaise, price.costPaise, name);
    if (!ok) return null;
    const conv = await this.conversationFor(tenantId, acc.id, to);
    try {
      const r = await this.wa.sendTemplate(this.creds(acc), to, { name, language: tpl.language, bodyParams: params });
      await this.db.admin.insert(waMessage).values({ tenantId, conversationId: conv.id, direction: 'outbound', type: 'template', body: { name, params }, metaMessageId: r.messageId, status: 'sent', category: tpl.category, costPaise: Math.round(price.costPaise), pricePaise: Math.round(price.pricePaise) });
      await this.db.admin.insert(messageDelivery).values({ tenantId, notificationId: ref?.notificationId, userId: ref?.userId, toAddress: to, channel: 'whatsapp', status: 'sent', providerRef: r.messageId, costPaise: Math.round(price.costPaise), pricePaise: Math.round(price.pricePaise) });
      return r.messageId;
    } catch (e: any) {
      await this.billing.walletAdjust(tenantId, Math.ceil(price.pricePaise), 'refund', `WA send failed: ${name}`);
      this.log.warn(`WA send failed ${e.message}`);
      return null;
    }
  }

  /** Free-form reply inside the 24-hour customer service window (free). */
  async reply(conversationId: string, text: string) {
    const tenantId = Ctx.tenantId();
    const [c] = await this.db.admin.select().from(waConversation).where(and(eq(waConversation.id, conversationId), eq(waConversation.tenantId, tenantId)));
    if (!c) throw notFound('Conversation');
    if (!c.lastInboundAt || Date.now() - c.lastInboundAt.getTime() > 24 * 3600_000) throw badRequest('24-hour window closed: send an approved template instead');
    const acc = await this.account(tenantId);
    if (!acc) throw badRequest('WhatsApp not connected');
    const r = await this.wa.sendText(this.creds(acc), c.contactPhone, text);
    const [m] = await this.db.admin.insert(waMessage).values({ tenantId, conversationId, direction: 'outbound', type: 'text', body: { text }, metaMessageId: r.messageId, status: 'sent', category: 'service' }).returning();
    return m;
  }

  // ---- Template studio ----
  async upsertTemplate(b: { name: string; language: string; category: 'marketing' | 'utility' | 'authentication'; components: unknown[] }, submit: boolean) {
    const tenantId = Ctx.tenantId();
    const acc = await this.account(tenantId);
    if (!acc) throw badRequest('Connect WhatsApp first');
    let status = 'draft', metaId: string | undefined;
    if (submit) {
      const r = await this.wa.createTemplate(this.creds(acc), b);
      status = String(r.status ?? 'PENDING').toLowerCase();
      metaId = r.id;
    }
    const [t] = await this.db.admin.insert(waTemplate).values({ tenantId, accountId: acc.id, ...b, status, metaId })
      .onConflictDoUpdate({ target: [waTemplate.tenantId, waTemplate.name, waTemplate.language], set: { components: b.components, category: b.category, status, metaId } }).returning();
    return t;
  }
  async syncTemplates() {
    const tenantId = Ctx.tenantId();
    const acc = await this.account(tenantId);
    if (!acc) throw badRequest('Connect WhatsApp first');
    const r = await this.wa.listTemplates(this.creds(acc));
    let n = 0;
    for (const t of r.data ?? []) {
      await this.db.admin.update(waTemplate).set({ status: String(t.status).toLowerCase(), metaId: t.id, rejectReason: t.rejected_reason ?? null }).where(and(eq(waTemplate.tenantId, tenantId), eq(waTemplate.name, t.name), eq(waTemplate.language, t.language)));
      n++;
    }
    return { synced: n };
  }
  async templates() {
    return this.db.admin.select().from(waTemplate).where(eq(waTemplate.tenantId, Ctx.tenantId())).orderBy(waTemplate.name);
  }

  // ---- Flow builder ----
  async saveFlow(b: { name: string; categories: string[]; flowJson: Record<string, unknown> }, id?: string) {
    const tenantId = Ctx.tenantId();
    const acc = await this.account(tenantId);
    if (!acc) throw badRequest('Connect WhatsApp first');
    validateFlowJson(b.flowJson);
    if (id) {
      const [f] = await this.db.admin.update(waFlow).set({ name: b.name, categories: b.categories, flowJson: b.flowJson }).where(and(eq(waFlow.id, id), eq(waFlow.tenantId, tenantId))).returning();
      if (f?.metaId) await this.wa.uploadFlowJson(this.creds(acc), f.metaId, b.flowJson);
      return f;
    }
    const r = await this.wa.createFlow(this.creds(acc), b.name, b.categories, b.flowJson);
    const [f] = await this.db.admin.insert(waFlow).values({ tenantId, accountId: acc.id, ...b, metaId: r.id }).returning();
    return f;
  }
  async publishFlow(id: string) {
    const tenantId = Ctx.tenantId();
    const [f] = await this.db.admin.select().from(waFlow).where(and(eq(waFlow.id, id), eq(waFlow.tenantId, tenantId)));
    if (!f) throw notFound('Flow');
    const acc = await this.account(tenantId);
    await this.wa.publishFlow(this.creds(acc!), f.metaId!);
    await this.db.admin.update(waFlow).set({ status: 'published' }).where(eq(waFlow.id, id));
    return { ok: true };
  }
  async flows() {
    return this.db.admin.select().from(waFlow).where(eq(waFlow.tenantId, Ctx.tenantId()));
  }

  // ---- Inbox ----
  async conversations() {
    return this.db.admin.select().from(waConversation).where(eq(waConversation.tenantId, Ctx.tenantId())).orderBy(desc(waConversation.updatedAt)).limit(200);
  }
  async messages(conversationId: string) {
    return this.db.admin.select().from(waMessage).where(and(eq(waMessage.conversationId, conversationId), eq(waMessage.tenantId, Ctx.tenantId()))).orderBy(desc(waMessage.createdAt)).limit(200);
  }

  // ---- Webhook ----
  async handleWebhook(body: any) {
    for (const entry of body?.entry ?? []) {
      for (const ch of entry.changes ?? []) {
        const v = ch.value ?? {};
        const pnid = v.metadata?.phone_number_id;
        if (!pnid) continue;
        const [acc] = await this.db.admin.select().from(waAccount).where(eq(waAccount.phoneNumberId, pnid)).limit(1);
        if (!acc) continue;
        for (const s of v.statuses ?? []) {
          const status = s.status === 'read' ? 'read' : s.status === 'delivered' ? 'delivered' : s.status === 'failed' ? 'failed' : 'sent';
          await this.db.admin.update(waMessage).set({ status, error: s.errors?.[0]?.title ?? null }).where(eq(waMessage.metaMessageId, s.id));
          await this.db.admin.update(messageDelivery).set({ status, error: s.errors?.[0]?.title ?? null }).where(eq(messageDelivery.providerRef, s.id));
          if (status === 'failed' && acc.tenantId) {
            // Meta does not charge failed messages → refund the wallet
            const [m] = await this.db.admin.select().from(waMessage).where(eq(waMessage.metaMessageId, s.id));
            if (m?.pricePaise) await this.billing.walletAdjust(acc.tenantId, m.pricePaise, 'refund', `WA failed ${s.id}`);
          }
        }
        if (!acc.tenantId) continue;
        for (const m of v.messages ?? []) {
          const from = '+' + m.from;
          const name = v.contacts?.find((c: any) => c.wa_id === m.from)?.profile?.name;
          const conv = await this.conversationFor(acc.tenantId, acc.id, from, name);
          await this.db.admin.update(waConversation).set({ lastInboundAt: new Date(), contactName: name ?? conv.contactName }).where(eq(waConversation.id, conv.id));
          await this.db.admin.insert(waMessage).values({ tenantId: acc.tenantId, conversationId: conv.id, direction: 'inbound', type: m.type, body: m, metaMessageId: m.id, status: 'delivered', category: 'service' }).onConflictDoNothing();
          // Unknown number → admission lead (click-to-WhatsApp, docs/03 crm)
          if (!conv.leadId) {
            const [l] = await this.db.admin.insert(lead).values({ tenantId: acc.tenantId, name: name ?? from, phone: from, source: 'whatsapp' }).onConflictDoNothing().returning();
            if (l) {
              await this.db.admin.update(waConversation).set({ leadId: l.id }).where(eq(waConversation.id, conv.id));
              await this.events.emit('lead.created', { leadId: l.id, source: 'whatsapp' }, { tenantId: acc.tenantId });
            }
          }
          await this.events.emit('wa.inbound', { conversationId: conv.id, from, type: m.type, flowResponse: m.interactive?.nfm_reply?.response_json ?? null }, { tenantId: acc.tenantId });
        }
      }
    }
    return { ok: true };
  }
}

/** Minimal Flow JSON validation before sending to Meta (version + screens with ids). */
export function validateFlowJson(f: any) {
  if (!f || typeof f !== 'object') throw new AppError('VALIDATION_FAILED', 'Flow JSON must be an object');
  if (!f.version) throw new AppError('VALIDATION_FAILED', 'Flow JSON needs "version" (e.g. "7.0")');
  if (!Array.isArray(f.screens) || !f.screens.length) throw new AppError('VALIDATION_FAILED', 'Flow JSON needs at least one screen');
  for (const s of f.screens) if (!/^[A-Z_]+$/.test(s.id ?? '')) throw new AppError('VALIDATION_FAILED', `Screen id "${s.id}" must be UPPER_SNAKE_CASE`);
  const terminal = f.screens.some((s: any) => s.terminal);
  if (!terminal) throw new AppError('VALIDATION_FAILED', 'At least one screen must be terminal');
}
