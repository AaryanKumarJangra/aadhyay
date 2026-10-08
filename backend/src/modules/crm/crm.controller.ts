import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Crm } from '@aadhyay/contracts';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { CrmService } from './crm.service';
import { crudController } from '../../common/crud';
import { campaign } from '../../db/schema';

@RequireModule('crm')
@Controller('crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}
  @Can('crm.lead.view') @Get('stages') stages() { return this.svc.stages(); }
  @Can('crm.lead.view') @Get('leads') list(@Query() q: any) { return this.svc.list(q); }
  @Can('crm.lead.create') @Post('leads') create(@Body(Z(Crm.leadInput)) b: any) { return this.svc.capture(b); }
  @Can('crm.lead.view') @Get('leads/:id') get(@Param('id') id: string) { return this.svc.timeline(id); }
  @Can('crm.lead.edit') @Patch('leads/:id') update(@Param('id') id: string, @Body(Z(Crm.leadUpdate)) b: any) { return this.svc.update(id, b); }
  @Can('crm.lead.edit') @Post('leads/:id/activities') activity(@Param('id') id: string, @Body(Z(Crm.leadActivityInput)) b: any) { return this.svc.addActivity(id, b); }
  @Can('crm.lead.edit', 'people.student.create') @Post('leads/:id/convert') convert(@Param('id') id: string, @Body(Z(Crm.convertLead)) b: any) { return this.svc.convert(id, b); }
  @Can('crm.report.view', 'crm.lead.view') @Get('reports/sources') sources() { return this.svc.sourceReport(); }
}

export const CampaignCrud = crudController({ path: 'crm/campaigns', module: 'crm', perm: 'crm.campaign', table: campaign as any, create: z.object({ name: z.string(), channel: z.enum(['push', 'inbox', 'messenger', 'whatsapp', 'sms', 'email']), audience: z.record(z.string(), z.unknown()).default({}), templateRef: z.string().optional(), costPaise: z.number().int().nonnegative().default(0), scheduledAt: z.coerce.date().optional() }) });
