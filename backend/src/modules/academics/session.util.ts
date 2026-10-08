import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/db.service';
import { academicSession } from '../../db/schema';
import { badRequest } from '../../common/errors';

export async function currentSession(tx: Tx) {
  const [s] = await tx.select().from(academicSession).where(eq(academicSession.isCurrent, true)).limit(1);
  if (!s) throw badRequest('No current academic session. Create one in Settings → Sessions.');
  return s;
}
