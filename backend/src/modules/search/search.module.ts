import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { enrollment, lead, receipt, schoolClass, section, staff, student } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { Authz } from '../../kernel/authz/authz';
import { currentSession } from '../academics/session.util';

export interface SearchHit { type: 'student' | 'staff' | 'receipt' | 'lead'; id: string; title: string; subtitle: string; href: string }

/**
 * Global search (Cmd/Ctrl+K). Each result type is included only if the user holds its view permission, and students are
 * narrowed to the user's scope — search never reveals a record the user could not open.
 */
@Injectable()
export class SearchService {
  constructor(private readonly db: DbService) {}

  async search(q: string): Promise<SearchHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const can = (k: Parameters<typeof Authz.decide>[0]) => Authz.decide(k).allowed;
    return this.db.t(async (tx) => {
      const out: SearchHit[] = [];
      if (can('people.student.view') || can('self.*')) {
        const sess = await currentSession(tx).catch(() => null);
        const scope = can('people.student.view')
          ? Authz.where('people.student.view', { section: enrollment.sectionId, student: student.id })
          : Authz.where('self.*', { student: student.id });
        const rows = await tx.select({ id: student.id, name: student.name, adm: student.admissionNo, cls: schoolClass.name, sec: section.name })
          .from(student)
          .leftJoin(enrollment, and(eq(enrollment.studentId, student.id), sess ? eq(enrollment.sessionId, sess.id) : undefined))
          .leftJoin(section, eq(section.id, enrollment.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId))
          .where(and(isNull(student.deletedAt), scope, or(ilike(student.name, like), ilike(student.admissionNo, like))))
          .limit(6);
        out.push(...rows.map((r) => ({ type: 'student' as const, id: r.id, title: r.name, subtitle: [r.adm, r.cls && `${r.cls}-${r.sec}`].filter(Boolean).join(' · '), href: `/app/students/${r.id}` })));
      }
      if (Authz.filter('people.staff.view').kind === 'all') {
        const rows = await tx.select({ id: staff.id, name: staff.name, code: staff.employeeCode }).from(staff).where(and(isNull(staff.deletedAt), or(ilike(staff.name, like), ilike(staff.employeeCode, like)))).limit(5);
        out.push(...rows.map((r) => ({ type: 'staff' as const, id: r.id, title: r.name, subtitle: `Staff · ${r.code}`, href: `/app/people/staff?focus=${r.id}` })));
      }
      if (Authz.filter('fees.payment.view').kind === 'all') {
        const rows = await tx.select({ id: receipt.id, number: receipt.number, name: student.name }).from(receipt).innerJoin(student, eq(student.id, receipt.studentId)).where(ilike(receipt.number, like)).orderBy(desc(receipt.id)).limit(5);
        out.push(...rows.map((r) => ({ type: 'receipt' as const, id: r.id, title: r.number, subtitle: `Receipt · ${r.name}`, href: `/app/fees/receipts/${r.id}` })));
      }
      if (Authz.filter('crm.lead.view').kind === 'all') {
        const rows = await tx.select({ id: lead.id, name: lead.name }).from(lead).where(or(ilike(lead.name, like), ilike(lead.phone, like))).orderBy(desc(lead.id)).limit(5);
        out.push(...rows.map((r) => ({ type: 'lead' as const, id: r.id, title: r.name, subtitle: 'Admission enquiry', href: `/app/crm?lead=${r.id}` })));
      }
      return out;
    });
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}
  /** Every member may search; results are filtered per type by permission and scope. */
  @Get() search(@Query('q') q = '') {
    void Ctx.tenantId();
    return this.svc.search(q.slice(0, 80));
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
