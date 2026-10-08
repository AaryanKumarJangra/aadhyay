import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { schoolClass, section, subject, classSubject, enrollment, period, timetableSlot, substitution, calendarEvent, staff, student } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { conflict, notFound } from '../../common/errors';
import { currentSession } from './session.util';

@Injectable()
export class AcademicsService {
  constructor(private readonly db: DbService) {}

  async createClass(b: { name: string; order: number; sections: string[] }) {
    return this.db.t(async (tx) => {
      const [c] = await tx.insert(schoolClass).values({ tenantId: Ctx.tenantId(), name: b.name, order: b.order }).returning();
      const secs = b.sections.length ? await tx.insert(section).values(b.sections.map((name) => ({ tenantId: Ctx.tenantId(), classId: c!.id, name }))).returning() : [];
      return { ...c!, sections: secs };
    });
  }

  async tree() {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const classes = await tx.select().from(schoolClass).orderBy(asc(schoolClass.order), asc(schoolClass.name));
      const secs = await tx.select({ id: section.id, classId: section.classId, name: section.name, classTeacherId: section.classTeacherId, capacity: section.capacity, teacherName: staff.name, strength: sql<number>`(select count(*)::int from enrollments e where e.section_id = ${section.id} and e.session_id = ${sess.id} and e.status = 'active')` })
        .from(section).leftJoin(staff, eq(staff.id, section.classTeacherId));
      return classes.map((c) => ({ ...c, sections: secs.filter((s) => s.classId === c.id).sort((a, b) => a.name.localeCompare(b.name)) }));
    });
  }

  /**
   * Year-end promotion: move enrolments from one session to the next using section mappings;
   * detained students repeat the same class (mapped to the same section name in the new session).
   */
  async promote(b: { fromSessionId: string; toSessionId: string; mappings: { fromSectionId: string; toSectionId: string }[]; detainStudentIds: string[] }) {
    return this.db.t(async (tx) => {
      let promoted = 0, detained = 0;
      for (const m of b.mappings) {
        const [to] = await tx.select().from(section).where(eq(section.id, m.toSectionId));
        if (!to) throw notFound('Target section');
        const [from] = await tx.select().from(section).where(eq(section.id, m.fromSectionId));
        const rows = await tx.select().from(enrollment).where(and(eq(enrollment.sessionId, b.fromSessionId), eq(enrollment.sectionId, m.fromSectionId), eq(enrollment.status, 'active')));
        for (const e of rows) {
          const isDetained = b.detainStudentIds.includes(e.studentId);
          await tx.update(enrollment).set({ status: isDetained ? 'detained' : 'promoted' }).where(eq(enrollment.id, e.id));
          await tx.insert(enrollment).values({ tenantId: Ctx.tenantId(), studentId: e.studentId, sessionId: b.toSessionId, classId: isDetained ? from!.classId : to.classId, sectionId: isDetained ? from!.id : to.id, rollNo: e.rollNo, status: 'active' })
            .onConflictDoNothing();
          isDetained ? detained++ : promoted++;
        }
      }
      return { promoted, detained };
    });
  }

  /** Assign roll numbers alphabetically within a section. */
  async autoRoll(sectionId: string) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const rows = await tx.select({ id: enrollment.id, name: student.name }).from(enrollment).innerJoin(student, eq(student.id, enrollment.studentId))
        .where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id), eq(enrollment.status, 'active'))).orderBy(asc(student.name));
      for (let i = 0; i < rows.length; i++) await tx.update(enrollment).set({ rollNo: String(i + 1) }).where(eq(enrollment.id, rows[i]!.id));
      return { updated: rows.length };
    });
  }

  // ---------------- Timetable ----------------
  /** Upsert a slot with teacher clash detection (a teacher can't be in two sections in the same period). */
  async setSlot(b: { sectionId: string; weekday: number; periodId: string; subjectId: string; teacherId?: string; room?: string }) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      if (b.teacherId) {
        const [clash] = await tx.select({ sectionId: timetableSlot.sectionId, name: section.name }).from(timetableSlot).innerJoin(section, eq(section.id, timetableSlot.sectionId))
          .where(and(eq(timetableSlot.sessionId, sess.id), eq(timetableSlot.weekday, b.weekday), eq(timetableSlot.periodId, b.periodId), eq(timetableSlot.teacherId, b.teacherId), ne(timetableSlot.sectionId, b.sectionId))).limit(1);
        if (clash) throw conflict(`Teacher already has a class in section ${clash.name} at this period`);
      }
      const [r] = await tx.insert(timetableSlot).values({ ...b, sessionId: sess.id, tenantId: Ctx.tenantId() })
        .onConflictDoUpdate({ target: [timetableSlot.tenantId, timetableSlot.sectionId, timetableSlot.weekday, timetableSlot.periodId], set: { subjectId: b.subjectId, teacherId: b.teacherId ?? null, room: b.room ?? null } }).returning();
      return r;
    });
  }

  async sectionTimetable(sectionId: string) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      return tx.select({ id: timetableSlot.id, weekday: timetableSlot.weekday, periodId: timetableSlot.periodId, subjectId: timetableSlot.subjectId, subject: subject.name, teacherId: timetableSlot.teacherId, teacher: staff.name, room: timetableSlot.room })
        .from(timetableSlot).leftJoin(subject, eq(subject.id, timetableSlot.subjectId)).leftJoin(staff, eq(staff.id, timetableSlot.teacherId))
        .where(and(eq(timetableSlot.sectionId, sectionId), eq(timetableSlot.sessionId, sess.id)));
    });
  }
  async teacherTimetable(teacherId: string) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      return tx.select({ id: timetableSlot.id, weekday: timetableSlot.weekday, periodId: timetableSlot.periodId, subject: subject.name, sectionId: timetableSlot.sectionId, section: section.name, className: schoolClass.name, room: timetableSlot.room })
        .from(timetableSlot).leftJoin(subject, eq(subject.id, timetableSlot.subjectId)).leftJoin(section, eq(section.id, timetableSlot.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, section.classId))
        .where(and(eq(timetableSlot.teacherId, teacherId), eq(timetableSlot.sessionId, sess.id)));
    });
  }

  /**
   * Auto timetable generator (greedy with constraints): fills each section's weekly periods from
   * class-subject requirements {subjectId, teacherId, periodsPerWeek}, avoiding teacher clashes and
   * spreading a subject across days. Returns unplaced items for manual adjustment.
   */
  async generate(sectionIds: string[], requirements: Record<string, { subjectId: string; teacherId?: string; periodsPerWeek: number }[]>, days = 6) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const periods = await tx.select().from(period).orderBy(asc(period.order));
      const busy = new Set<string>(); // teacher|day|period
      const existing = await tx.select().from(timetableSlot).where(and(eq(timetableSlot.sessionId, sess.id)));
      for (const e of existing) if (e.teacherId && !sectionIds.includes(e.sectionId)) busy.add(`${e.teacherId}|${e.weekday}|${e.periodId}`);
      await tx.delete(timetableSlot).where(and(eq(timetableSlot.sessionId, sess.id), inArray(timetableSlot.sectionId, sectionIds)));
      const unplaced: { sectionId: string; subjectId: string; missing: number }[] = [];
      let placed = 0;
      for (const sid of sectionIds) {
        const grid = new Map<string, boolean>();
        const reqs = [...(requirements[sid] ?? [])].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek);
        for (const r of reqs) {
          let left = r.periodsPerWeek;
          for (let pass = 0; pass < 3 && left > 0; pass++) {
            for (let d = 1; d <= days && left > 0; d++) {
              const perDay = [...grid.keys()].filter((k) => k.startsWith(`${d}|`) && grid.get(k) && k.endsWith(`|${r.subjectId}`)).length;
              if (pass === 0 && perDay >= 1) continue;
              if (pass === 1 && perDay >= 2) continue;
              const p = periods.find((p) => !grid.has(`${d}|${p.id}`) && !(r.teacherId && busy.has(`${r.teacherId}|${d}|${p.id}`)));
              if (!p) continue;
              grid.set(`${d}|${p.id}`, true);
              grid.set(`${d}|${p.id}|${r.subjectId}`, true);
              if (r.teacherId) busy.add(`${r.teacherId}|${d}|${p.id}`);
              await tx.insert(timetableSlot).values({ tenantId: Ctx.tenantId(), sessionId: sess.id, sectionId: sid, weekday: d, periodId: p.id, subjectId: r.subjectId, teacherId: r.teacherId });
              left--;
              placed++;
            }
          }
          if (left > 0) unplaced.push({ sectionId: sid, subjectId: r.subjectId, missing: left });
        }
      }
      return { placed, unplaced };
    });
  }

  /** iCal feed of holidays/events (subscribe from Google/Apple calendar). */
  async ical(tenantName: string) {
    const rows = await this.db.t((tx) => tx.select().from(calendarEvent).orderBy(asc(calendarEvent.startsOn)));
    const d = (s: string) => s.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//Aadhyay//${tenantName}//EN`, `X-WR-CALNAME:${tenantName}`];
    for (const e of rows) {
      const end = new Date(e.endsOn + 'T00:00:00Z');
      end.setUTCDate(end.getUTCDate() + 1);
      lines.push('BEGIN:VEVENT', `UID:${e.id}@aadhyay.com`, `DTSTART;VALUE=DATE:${d(e.startsOn)}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`, `SUMMARY:${e.title.replace(/[,;]/g, ' ')}`, `CATEGORIES:${e.kind}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
