import { Body, Controller, Module, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { crudController } from '../../common/crud';
import { enquiry, visitor, callLog, postalRecord, complaint } from '../../db/schema';
import { phoneIN } from '@aadhyay/contracts';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { DbService } from '../../db/db.service';
import { CrmService } from '../crm/crm.service';
import { notFound } from '../../common/errors';

const d = z.coerce.date();
export const EnquiryCrud = crudController({ path: 'front-office/enquiries', module: 'front-office', perm: 'front-office.enquiry', table: enquiry as any, create: z.object({ name: z.string(), phone: phoneIN, forClass: z.string().optional(), source: z.string().optional(), note: z.string().optional(), followUpOn: z.string().optional(), status: z.string().default('open') }), search: [enquiry.name, enquiry.phone], filters: { status: enquiry.status } });
export const VisitorCrud = crudController({ path: 'front-office/visitors', module: 'front-office', perm: 'front-office.visitor', table: visitor as any, create: z.object({ name: z.string(), phone: z.string(), purpose: z.string(), meetWith: z.string().optional(), photoFileId: z.string().uuid().optional(), outAt: d.optional() }), search: [visitor.name, visitor.phone] });
export const CallLogCrud = crudController({ path: 'front-office/calls', module: 'front-office', perm: 'front-office.call', table: callLog as any, create: z.object({ name: z.string().optional(), phone: z.string(), direction: z.enum(['inbound', 'outbound']), note: z.string().optional(), followUpOn: z.string().optional() }), search: [callLog.phone, callLog.name] });
export const PostalCrud = crudController({ path: 'front-office/postal', module: 'front-office', perm: 'front-office.postal', table: postalRecord as any, create: z.object({ direction: z.enum(['inbound', 'outbound']), party: z.string(), reference: z.string().optional(), note: z.string().optional() }) });
export const ComplaintCrud = crudController({ path: 'front-office/complaints', module: 'front-office', perm: 'front-office.complaint', table: complaint as any, create: z.object({ name: z.string(), phone: z.string().optional(), category: z.string(), description: z.string(), assignedTo: z.string().uuid().optional(), status: z.enum(['open', 'in_progress', 'resolved', 'closed']).default('open'), slaDueAt: d.optional() }), filters: { status: complaint.status, category: complaint.category } });

@RequireModule('front-office')
@Controller('front-office')
export class FrontOfficeController {
  constructor(private readonly db: DbService, private readonly crm: CrmService) {}
  /** Walk-in enquiry → CRM lead (dedupe by phone). */
  @Can('front-office.enquiry.edit', 'crm.lead.create') @Post('enquiries/:id/to-lead')
  async toLead(@Param('id') id: string) {
    const [e] = await this.db.t((tx) => tx.select().from(enquiry).where(eq(enquiry.id, id)));
    if (!e) throw notFound('Enquiry');
    const l = await this.crm.capture({ name: e.name, phone: e.phone, forClass: e.forClass ?? undefined, source: e.source ?? 'walk_in', note: e.note ?? undefined });
    await this.db.t((tx) => tx.update(enquiry).set({ leadId: l.id, status: 'converted' }).where(eq(enquiry.id, id)));
    return l;
  }
}

@Module({ controllers: [FrontOfficeController, EnquiryCrud, VisitorCrud, CallLogCrud, PostalCrud, ComplaintCrud] })
export class FrontOfficeModule {}
