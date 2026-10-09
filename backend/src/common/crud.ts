import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Type } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, lt, or, SQL, getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ZodType } from 'zod';
import { isKnownPermission, type ModuleKey, type PermissionKey, type ResourcePrefix, type ResourceRef } from '@aadhyay/contracts';
import { DbService, type Tx } from '../db/db.service';
import { Can, RequireModule, Scoped } from '../kernel/auth/decorators';
import { Ctx } from '../kernel/context/request-context';
import { Authz } from '../kernel/authz/authz';
import { currentSectionOf, studentRef } from '../kernel/authz/refs';
import { AccessService } from '../kernel/rbac/access.service';
import { Z } from './zod.pipe';
import { notFound } from './errors';

export interface CrudOptions {
  /** Route path under /v1, e.g. 'library/books' */
  path: string;
  module: ModuleKey;
  /** Catalogue resource prefix `<module>.<resource>`; view/create/edit/delete are appended (checked at startup). */
  perm: ResourcePrefix<'view'>;
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
  /**
   * Record-level scope. Without it, every route requires the permission institution-wide. With it, users holding the
   * permission for assigned sections / own students see and change only those rows.
   */
  scope?: { section?: PgColumn; student?: PgColumn; studentArray?: PgColumn };
  /** Writes change who-can-see-what (e.g. class teachers, subject teachers): refresh cached access. */
  bustAccess?: boolean;
}

/**
 * Generates a tenant-scoped REST controller: GET list (cursor + search + filters), GET :id, POST, PATCH :id, DELETE :id.
 * Tenant isolation is enforced by RLS inside db.t(); tenant_id is injected on create.
 */
export function crudController(o: CrudOptions): Type<any> {
  const cols = getTableColumns(o.table as any) as Record<string, PgColumn>;
  const hasDeletedAt = 'deletedAt' in cols;
  const key = (a: string) => {
    const k = `${o.perm}.${a}`;
    if (!isKnownPermission(k)) throw new Error(`crudController(${o.path}): permission ${k} is not in the catalogue`);
    return k as PermissionKey;
  };
  const K = { view: key('view'), ...(o.readonly ? {} : { create: key('create'), edit: key('edit'), delete: key('delete') }) } as Record<'view' | 'create' | 'edit' | 'delete', PermissionKey>;
  const scope = o.scope;
  const sectionKey = scope?.section ? Object.entries(cols).find(([, c]) => c === scope.section)?.[0] : undefined;
  const studentKey = scope?.student ? Object.entries(cols).find(([, c]) => c === scope.student)?.[0] : undefined;
  const arrayKey = scope?.studentArray ? Object.entries(cols).find(([, c]) => c === scope.studentArray)?.[0] : undefined;

  /** Asserts `perm` on a row: its section/student, or every student listed in its array column. */
  async function assertRow(tx: Tx, perm: PermissionKey, row: Record<string, any>) {
    if (arrayKey) {
      const ids: string[] = row[arrayKey] ?? [];
      if (!ids.length) Authz.assert(perm, { studentId: null });
      for (const sid of ids) Authz.assert(perm, await studentRef(tx, sid));
      return;
    }
    Authz.assert(perm, await refOf(tx, row));
  }

  async function refOf(tx: Tx, row: Record<string, any>): Promise<ResourceRef> {
    const studentId = studentKey ? row[studentKey] ?? null : null;
    const sectionId = sectionKey ? row[sectionKey] ?? null : null;
    if (!sectionId && studentId) return studentRef(tx, studentId);
    return { sectionId, studentId };
  }

  @RequireModule(o.module)
  @Controller(o.path)
  class CrudController {
    constructor(@Inject(DbService) readonly db: DbService, @Inject(AccessService) readonly access: AccessService) {}

    @Can(K.view) @Get()
    async list(@Query() q: Record<string, string>) {
      const limit = Math.min(Number(q.limit ?? 50) || 50, 500);
      const conds: (SQL | undefined)[] = [];
      if (q.q && o.search?.length) conds.push(or(...o.search.map((c) => ilike(c, `%${q.q}%`))));
      for (const [k, col] of Object.entries(o.filters ?? {})) if (q[k] !== undefined && q[k] !== '') conds.push(eq(col, q[k] === 'true' ? true : q[k] === 'false' ? false : q[k]));
      if (hasDeletedAt) conds.push(isNull(cols.deletedAt!));
      if (scope?.studentArray) conds.push(Authz.whereStudentArray(K.view, scope.studentArray));
      else if (scope) conds.push(Authz.where(K.view, { section: scope.section ?? (scope.student ? currentSectionOf(scope.student) : undefined), student: scope.student }));
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

    @Can(K.view) @Get(':id')
    async get(@Param('id') id: string) {
      return this.db.t(async (tx) => {
        const [r] = await tx.select().from(o.table as any).where(eq(o.table.id, id)).limit(1);
        if (!r) throw notFound(o.perm.split('.').pop()!);
        if (scope) await assertRow(tx, K.view, r);
        return r;
      });
    }

    async create(body: any) {
      const data = { ...(o.beforeWrite ? o.beforeWrite(body, 'create') : body), tenantId: Ctx.tenantId() };
      const r = await this.db.t(async (tx) => {
        if (scope) await assertRow(tx, K.create, data);
        const [row] = await tx.insert(o.table).values(data).returning();
        return row;
      });
      if (o.bustAccess) await this.access.bust(Ctx.tenantId());
      return r;
    }

    async update(id: string, raw: Record<string, unknown>) {
      // Partial update: validate, then keep only keys the client actually sent (schema defaults must not overwrite data).
      const parsed = Z((o.update ?? (o.create as any).partial?.()) as ZodType<any>).transform(raw ?? {});
      const body = Object.fromEntries(Object.entries(parsed).filter(([k]) => raw && k in raw));
      const data = o.beforeWrite ? o.beforeWrite(body, 'update') : body;
      delete data.tenantId;
      delete data.id;
      const r = await this.db.t(async (tx) => {
        if (scope) {
          const [cur] = await tx.select().from(o.table as any).where(eq(o.table.id, id)).limit(1);
          if (!cur) throw notFound(o.perm.split('.').pop()!);
          await assertRow(tx, K.edit, cur);
          await assertRow(tx, K.edit, { ...cur, ...data });
        }
        const [row] = await tx.update(o.table).set(data).where(eq(o.table.id, id)).returning();
        return row;
      });
      if (!r) throw notFound(o.perm.split('.').pop()!);
      if (o.bustAccess) await this.access.bust(Ctx.tenantId());
      return r;
    }

    async remove(id: string) {
      const r = await this.db.t(async (tx) => {
        if (scope) {
          const [cur] = await tx.select().from(o.table as any).where(eq(o.table.id, id)).limit(1);
          if (cur) await assertRow(tx, K.delete, cur);
        }
        return hasDeletedAt
          ? tx.update(o.table).set({ deletedAt: new Date() } as any).where(eq(o.table.id, id)).returning()
          : tx.delete(o.table).where(eq(o.table.id, id)).returning();
      });
      if (!(r as any[]).length) throw notFound(o.perm.split('.').pop()!);
      if (o.bustAccess) await this.access.bust(Ctx.tenantId());
      return { ok: true };
    }
  }
  const P = CrudController.prototype as any;
  const apply = (name: string, ...decs: MethodDecorator[]) => {
    const d = Object.getOwnPropertyDescriptor(P, name)!;
    for (const dec of decs) dec(P, name, d);
    Object.defineProperty(P, name, d);
  };
  if (scope) { apply('list', Scoped()); apply('get', Scoped()); }
  // Write routes only for writable resources (read-only lists expose GET only).
  if (!o.readonly) {
    const s = scope ? [Scoped()] : [];
    apply('create', Post(), Can(K.create), ...s);
    apply('update', Patch(':id'), Can(K.edit), ...s);
    apply('remove', Delete(':id'), Can(K.delete), ...s);
    Body(Z(o.create))(P, 'create', 0);
    Param('id')(P, 'update', 0);
    Body()(P, 'update', 1);
    Param('id')(P, 'remove', 0);
  }
  Object.defineProperty(CrudController, 'name', { value: `Crud_${o.path.replace(/\W/g, '_')}` });
  return CrudController;
}
