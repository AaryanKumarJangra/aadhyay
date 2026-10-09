import { and, eq, inArray } from 'drizzle-orm';
import type { PermissionKey, ResourceRef } from '@aadhyay/contracts';
import type { Tx } from '../../db/db.service';
import { section, enrollment } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { notFound } from '../../common/errors';
import { Authz, denied } from '../../kernel/authz/authz';
import { currentSession } from './session.util';

/** Staff action on a section (mark attendance, set homework …): the permission's scope must cover the section. */
export async function assertSectionAccess(tx: Tx, sectionId: string, key: PermissionKey, extra: Omit<ResourceRef, 'sectionId'> = {}) {
  const [sec] = await tx.select({ id: section.id }).from(section).where(eq(section.id, sectionId));
  if (!sec) throw notFound('Section');
  return Authz.assert(key, { sectionId, ...extra });
}

/**
 * Read access to section-level content (homework list, class diary): staff whose scope covers the section, or a
 * parent/student whose own student is enrolled in it this session.
 */
export async function assertSectionRead(tx: Tx, sectionId: string, key: PermissionKey) {
  const d = Authz.decide(key, { sectionId });
  if (d.allowed) return;
  const own = Ctx.get().studentIds ?? [];
  if (own.length && Authz.decide('self.*').allowed) {
    const sess = await currentSession(tx);
    const [e] = await tx.select({ id: enrollment.id }).from(enrollment).where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id), inArray(enrollment.studentId, own))).limit(1);
    if (e) return;
  }
  throw denied(d);
}
