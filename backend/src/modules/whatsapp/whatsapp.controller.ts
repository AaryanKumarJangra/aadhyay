import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WhatsApp } from '@aadhyay/contracts';
import { Can, Public } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAdapter } from '../../adapters/whatsapp/whatsapp.adapter';
import { env } from '../../config/env';
import { AppError } from '../../common/errors';

/** WhatsApp Channel (paid add-on). Connecting an account enables the module. */
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly svc: WhatsAppService) {}

  @Can('whatsapp.account.manage', 'org.settings.edit') @Post('accounts')
  connect(@Body(Z(WhatsApp.connectWaAccount)) b: any) {
    return this.svc.connect(b);
  }
  @Can('whatsapp.account.view', 'comms.notice.view') @Get('account')
  async account() {
    const a = await this.svc.account();
    return a ? { id: a.id, displayPhone: a.displayPhone, verifiedName: a.verifiedName, status: a.status, quality: a.quality } : null;
  }
  @Can('whatsapp.template.view') @Get('templates')
  templates() {
    return this.svc.templates();
  }
  @Can('whatsapp.template.create') @Post('templates')
  upsertTemplate(@Body(Z(WhatsApp.waTemplateInput.extend({ submit: z.boolean().default(true) }))) b: any) {
    const { submit, ...t } = b;
    return this.svc.upsertTemplate(t, submit);
  }
  @Can('whatsapp.template.edit') @Post('templates/sync')
  sync() {
    return this.svc.syncTemplates();
  }
  @Can('whatsapp.flow.view') @Get('flows')
  flows() {
    return this.svc.flows();
  }
  @Can('whatsapp.flow.create') @Post('flows')
  createFlow(@Body(Z(WhatsApp.waFlowInput)) b: any) {
    return this.svc.saveFlow(b);
  }
  @Can('whatsapp.flow.edit') @Put('flows/:id')
  updateFlow(@Param('id') id: string, @Body(Z(WhatsApp.waFlowInput)) b: any) {
    return this.svc.saveFlow(b, id);
  }
  @Can('whatsapp.flow.edit') @Post('flows/:id/publish')
  publish(@Param('id') id: string) {
    return this.svc.publishFlow(id);
  }
  @Can('whatsapp.inbox.view') @Get('conversations')
  conversations() {
    return this.svc.conversations();
  }
  @Can('whatsapp.inbox.view') @Get('conversations/:id/messages')
  messages(@Param('id') id: string) {
    return this.svc.messages(id);
  }
  @Can('whatsapp.inbox.create') @Post('conversations/:id/reply')
  reply(@Param('id') id: string, @Body(Z(z.object({ text: z.string().min(1).max(4096) }))) b: any) {
    return this.svc.reply(id, b.text);
  }
}

/** Meta webhook: GET verification + POST events (signature verified). */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly svc: WhatsAppService, private readonly wa: WhatsAppAdapter) {}
  @Public() @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: FastifyReply) {
    if (mode === 'subscribe' && token && token === env.META_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send('forbidden');
  }
  @Public() @Post()
  async hook(@Req() req: FastifyRequest & { rawBody?: Buffer }) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    if (!this.wa.verifySignature(raw, req.headers['x-hub-signature-256'] as string)) throw new AppError('FORBIDDEN', 'Bad signature');
    return this.svc.handleWebhook(req.body);
  }
}
