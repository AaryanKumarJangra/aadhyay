import { and, desc, lt, SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/** Cursor pagination on a uuid v7 id column (time-ordered). */
export function cursorWhere(idCol: PgColumn, cursor?: string, extra?: SQL | undefined) {
  return cursor ? and(lt(idCol, cursor), extra) : extra;
}
export function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
export const newestFirst = (idCol: PgColumn) => desc(idCol);
