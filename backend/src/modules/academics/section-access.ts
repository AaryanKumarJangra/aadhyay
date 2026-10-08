import { and, eq, isNull, or } from 'drizzle-orm';
import type { Tx } from '../../db/db.service';
import { section, classSubject } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { forbidden } from '../../common/errors';

/**
 * Scope check for teacher actions on a section: allowed if the user has tenant-wide scope, an explicit
 * section/class scope covering it, or is the class teacher / a subject teacher of that section.
 */
export async function assertSectionAccess(tx: Tx, sectionId: string) {
  const c = Ctx.get();
  if (c.permissions?.has('*')) return;
  const scopes = c.scopes?.all ?? [];
  if (scopes.some((s) => s.kind === 'tenant')) return;
  const [sec] = await tx.select().from(section).where(eq(section.id, sectionId));
  if (!sec) throw forbidden('Section not found');
  if (scopes.some((s) => (s.kind === 'section' && s.id === sectionId) || (s.kind === 'class' && s.id === sec.classId))) return;
  const staffId = c.personIds?.staff;
  if (staffId && sec.classTeacherId === staffId) return;
  if (staffId) {
    const [cs] = await tx.select({ id: classSubject.id }).from(classSubject).where(and(eq(classSubject.teacherId, staffId), eq(classSubject.classId, sec.classId), or(eq(classSubject.sectionId, sectionId), isNull(classSubject.sectionId)))).limit(1);
    if (cs) return;
  }
  throw forbidden('You are not assigned to this section');
}
