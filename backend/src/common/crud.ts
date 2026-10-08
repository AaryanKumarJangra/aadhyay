import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Type } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, lt, or, SQL, getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ZodType } from 'zod';
import type { ModuleKey } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { Can, RequireModule } from '../kernel/auth/decorators';
import { Ctx } from '../kernel/context/request-context';
import { Z } from './zod.pipe';
import { notFound } from './errors';

export interface CrudOptions {
  /** Route path under /v1, e.g. 'library/books' */
  path: string;
  module: ModuleKey;
  /** Permission prefix: `<module>.<resource>` → view/create/edit/delete actions are appended. */
  perm: string;
  table: PgTable & { id: PgColumn; tenantId: PgColumn };
  create: ZodType<any>;
  update?: ZodType<any>;
  /** Columns searched with ?q= (ILIKE). */
  search?: PgColumn[];
  /** Query-string filters allowed: ?<key>=value → eq(column, value). */
  filters?: Record<string, PgColumn>;
  sort?: { column: PgColumn; dir?: 'asc' | 'desc' };
  /** Optional hook to transform input before insert/update. */
  beforeWrite?: (data: any, mode: 'create' | 'update') => any;
  readonly?: boolean;
}

/**
 * Generates a tenant-scoped REST controller: GET list (cursor + search + filters), GET :id, POST, PATCH :id, DELETE :id.
 * Tenant isolation is enforced by RLS inside db.t(); tenant_id is injected on create.
 */
export function crudController(o: CrudOptions): Type<any> {
  const cols = getTableColumns(o.table as any) as Record<string, PgColumn>;
  const hasDeletedAt = 'deletedAt' in cols;

  @RequireModule(o.module)
  @Controller(o.path)
  class CrudController {
    constructor(@Inject(DbService) readonly db: DbService) {}

    @Can(`${o.perm}.view`) @Get()
    async list(@Query() q: Record<string, string>) {
      const limit = Math.min(Number(q.limit ?? 50) || 50, 500);
      const conds: (SQL | undefined)[] = [];
      if (q.q && o.search?.length) conds.push(or(...o.search.map((c) => ilike(c, `%${q.q}%`))));
      for (const [k, col] of Object.entries(o.filters ?? {})) if (q[k] !== undefined && q[k] !== '') conds.push(eq(col, q[k] === 'true' ? true : q[k] === 'false' ? false : q[k]));
      if (hasDeletedAt) conds.push(isNull(cols.deletedAt!));
      const sortCol = o.sort?.column ?? o.table.id;
      const useCursor = !o.sort && q.cursor;
      if (useCursor) conds.push(lt(o.table.id, q.cursor));
      const rows = await this.db.t((tx) =>
        tx.select().from(o.table as any).where(and(...conds)).orderBy(o.sort?.dir === 'asc' ? asc(sortCol) : desc(sortCol)).limit(limit + 1),
      );
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore && !o.sort ? (items[items.length - 1] as any).id : null };
    }

    @Can(`${o.perm}.view`) @Get(':id')
    async get(@Param('id') id: string) {
      const [r] = await this.db.t((tx) => tx.select().from(o.table as any).where(eq(o.table.id, id)).limit(1));
      if (!r) throw notFound(o.perm.split('.').pop()!);
      return r;
    }

    async create(body: any) {
      const data = { ...(o.beforeWrite ? o.beforeWrite(body, 'create') : body), tenantId: Ctx.tenantId() };
      const [r] = await this.db.t((tx) => tx.insert(o.table).values(data).returning());
      return r;
    }

    async update(id: string, raw: Record<string, unknown>) {
      // Partial update: validate, then keep only keys the client actually sent (schema defaults must not overwrite data).
      const parsed = Z((o.update ?? (o.create as any).partial?.()) as ZodType<any>).transform(raw ?? {});
      const body = Object.fromEntries(Object.entries(parsed).filter(([k]) => raw && k in raw));
      const data = o.beforeWrite ? o.beforeWrite(body, 'update') : body;
      delete data.tenantId;
      delete data.id;
      const [r] = await this.db.t((tx) => tx.update(o.table).set(data).where(eq(o.table.id, id)).returning());
      if (!r) throw notFound(o.perm.split('.').pop()!);
      return r;
    }

    async remove(id: string) {
      const r = await this.db.t((tx) =>
        hasDeletedAt
          ? tx.update(o.table).set({ deletedAt: new Date() } as any).where(eq(o.table.id, id)).returning()
          : tx.delete(o.table).where(eq(o.table.id, id)).returning(),
      );
      if (!(r as any[]).length) throw notFound(o.perm.split('.').pop()!);
      return { ok: true };
    }
  }
  // Write routes only for writable resources (read-only lists expose GET only).
  if (!o.readonly) {
    const P = CrudController.prototype as any;
    const apply = (name: string, ...decs: MethodDecorator[]) => {
      const d = Object.getOwnPropertyDescriptor(P, name)!;
      for (const dec of decs) dec(P, name, d);
      Object.defineProperty(P, name, d);
    };
    apply('create', Post(), Can(`${o.perm}.create`));
    apply('update', Patch(':id'), Can(`${o.perm}.edit`));
    apply('remove', Delete(':id'), Can(`${o.perm}.delete`));
    Body(Z(o.create))(P, 'create', 0);
    Param('id')(P, 'update', 0);
    Body()(P, 'update', 1);
    Param('id')(P, 'remove', 0);
  }
  Object.defineProperty(CrudController, 'name', { value: `Crud_${o.path.replace(/\W/g, '_')}` });
  return CrudController;
}
