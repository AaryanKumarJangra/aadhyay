import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ResourceRef } from '@aadhyay/contracts';
import type { Tx } from '../../db/db.service';
import { academicSession, enrollment } from '../../db/schema';

/** Authorization reference for a student: their current section (for section scope) and id (for own scope). */
export async function studentRef(tx: Tx, studentId: string): Promise<ResourceRef> {
  const [e] = await tx
    .select({ sectionId: enrollment.sectionId })
    .from(enrollment)
    .innerJoin(academicSession, eq(academicSession.id, enrollment.sessionId))
    .where(and(eq(enrollment.studentId, studentId), eq(academicSession.isCurrent, true)))
    .orderBy(desc(enrollment.createdAt))
    .limit(1);
  return { studentId, sectionId: e?.sectionId ?? null };
}

/** SQL expression: the current section of the student in `studentCol` (for scope filters on student-keyed tables). */
export function currentSectionOf(studentCol: PgColumn): SQL {
  return sql`(select e.section_id from enrollments e join academic_sessions s on s.id = e.session_id and s.is_current where e.student_id = ${studentCol} order by e.created_at desc limit 1)`;
}
