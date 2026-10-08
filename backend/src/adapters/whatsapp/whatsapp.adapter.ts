import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env';
import { safeEqual } from '../../common/crypto';

export interface WaCreds { phoneNumberId: string; token: string; wabaId?: string }
export interface WaTemplateSend { name: string; language: string; bodyParams?: string[]; buttonUrlParam?: string; headerDocumentUrl?: string }
export interface WaSendResult { messageId: string }

/**
 * Official Meta WhatsApp Cloud API (Graph API). No unofficial libraries — see docs/02 §7.1.
 * `log` provider prints messages (development & tests).
 */
@Injectable()
export class WhatsAppAdapter {
  private readonly log = new Logger('WhatsApp');
  private get base() {
    return `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
  }
  private get live() {
    return env.WHATSAPP_PROVIDER === 'meta';
  }

  private async graph(token: string, path: string, method: string, body?: unknown) {
    const res = await fetch(`${this.base}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(`meta ${res.status}: ${j?.error?.message ?? 'error'}`);
    return j;
  }

  async sendTemplate(c: WaCreds, to: string, t: WaTemplateSend): Promise<WaSendResult> {
    const components: any[] = [];
    if (t.headerDocumentUrl) components.push({ type: 'header', parameters: [{ type: 'document', document: { link: t.headerDocumentUrl } }] });
    if (t.bodyParams?.length) components.push({ type: 'body', parameters: t.bodyParams.map((text) => ({ type: 'text', text })) });
    if (t.buttonUrlParam) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: t.buttonUrlParam }] });
    if (!this.live) {
      this.log.log(`[wa template ${t.name}→${to}] ${JSON.stringify(t.bodyParams ?? [])}`);
      return { messageId: `wamid.log.${Date.now()}.${Math.random().toString(36).slice(2, 8)}` };
    }
    const j = await this.graph(c.token, `${c.phoneNumberId}/messages`, 'POST', {
      messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
      template: { name: t.name, language: { code: t.language }, components },
    });
    return { messageId: j.messages[0].id };
  }

  async sendText(c: WaCreds, to: string, text: string): Promise<WaSendResult> {
    if (!this.live) {
      this.log.log(`[wa text→${to}] ${text}`);
      return { messageId: `wamid.log.${Date.now()}` };
    }
    const j = await this.graph(c.token, `${c.phoneNumberId}/messages`, 'POST', { messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'text', text: { body: text, preview_url: true } });
    return { messageId: j.messages[0].id };
  }

  /** Template studio → Meta. */
  async createTemplate(c: WaCreds, tpl: { name: string; language: string; category: string; components: unknown[] }) {
    if (!this.live) return { id: `tpl-log-${Date.now()}`, status: 'PENDING' };
    return this.graph(c.token, `${c.wabaId}/message_templates`, 'POST', { ...tpl, category: tpl.category.toUpperCase() });
  }
  async listTemplates(c: WaCreds) {
    if (!this.live) return { data: [] };
    return this.graph(c.token, `${c.wabaId}/message_templates?limit=200`, 'GET');
  }
  async deleteTemplate(c: WaCreds, name: string) {
    if (!this.live) return { success: true };
    return this.graph(c.token, `${c.wabaId}/message_templates?name=${encodeURIComponent(name)}`, 'DELETE');
  }
  /** Flow builder → Meta: create flow, upload Flow JSON, publish. */
  async createFlow(c: WaCreds, name: string, categories: string[], flowJson: unknown) {
    if (!this.live) return { id: `flow-log-${Date.now()}` };
    const f = await this.graph(c.token, `${c.wabaId}/flows`, 'POST', { name, categories });
    await this.uploadFlowJson(c, f.id, flowJson);
    return f;
  }
  async uploadFlowJson(c: WaCreds, flowId: string, flowJson: unknown) {
    if (!this.live) return;
    const form = new FormData();
    form.append('name', 'flow.json');
    form.append('asset_type', 'FLOW_JSON');
    form.append('file', new Blob([JSON.stringify(flowJson)], { type: 'application/json' }), 'flow.json');
    const res = await fetch(`${this.base}/${flowId}/assets`, { method: 'POST', headers: { Authorization: `Bearer ${c.token}` }, body: form });
    if (!res.ok) throw new Error(`meta flow upload ${res.status}`);
  }
  async publishFlow(c: WaCreds, flowId: string) {
    if (!this.live) return { success: true };
    return this.graph(c.token, `${flowId}/publish`, 'POST');
  }

  /** Verify X-Hub-Signature-256 on webhooks. */
  verifySignature(rawBody: string | Buffer, header: string | undefined): boolean {
    if (!env.META_APP_SECRET) return !this.live;
    if (!header?.startsWith('sha256=')) return false;
    const expected = 'sha256=' + createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex');
    return safeEqual(expected, header);
  }
}
