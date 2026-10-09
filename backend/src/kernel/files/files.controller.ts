import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { hasPermission } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { StorageAdapter } from '../../adapters/storage/storage.adapter';
import { file } from '../../db/schema';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../context/request-context';
import { uuidv7 } from '../../common/ids';
import { notFound, badRequest, forbidden } from '../../common/errors';
import { TenantOptional, Public } from '../auth/decorators';

const MB = 1024 * 1024;
/** Server-side MIME → extension map. The stored extension never comes from the client's filename. */
const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
  'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/webm': 'weba',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/octet-stream': 'bin',
};
const IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
const DOCS = [...IMAGES, 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SHEETS = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

/**
 * Every upload declares a purpose. The purpose decides which MIME types and sizes are accepted, who may upload,
 * whether the file may be public, and who besides the uploader may read it. Unknown purposes are rejected.
 *   uploadPerm: permission needed to upload (null = any signed-in user)
 *   viewPerm:   permission needed to read another user's private file in the same tenant (null = any tenant member)
 */
const PURPOSES: Record<string, { mimes: string[]; maxBytes: number; publicAllowed: boolean; uploadPerm: string | null; viewPerm: string | null }> = {
  avatar: { mimes: IMAGES, maxBytes: 5 * MB, publicAllowed: false, uploadPerm: null, viewPerm: null },
  logo: { mimes: IMAGES, maxBytes: 5 * MB, publicAllowed: true, uploadPerm: 'org.settings.edit', viewPerm: null },
  website: { mimes: [...IMAGES, 'application/pdf', 'video/mp4', 'video/webm'], maxBytes: 100 * MB, publicAllowed: true, uploadPerm: 'cms.page.edit', viewPerm: null },
  homework: { mimes: [...DOCS, 'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4'], maxBytes: 50 * MB, publicAllowed: false, uploadPerm: null, viewPerm: null },
  document: { mimes: DOCS, maxBytes: 25 * MB, publicAllowed: false, uploadPerm: null, viewPerm: 'people.document.view' },
  admission: { mimes: DOCS, maxBytes: 25 * MB, publicAllowed: false, uploadPerm: null, viewPerm: 'people.document.view' },
  import: { mimes: SHEETS, maxBytes: 20 * MB, publicAllowed: false, uploadPerm: null, viewPerm: 'reports.export.export' },
  attachment: { mimes: Object.keys(MIME_EXT), maxBytes: 200 * MB, publicAllowed: false, uploadPerm: null, viewPerm: null },
};

const uploadReq = z.object({
  purpose: z.enum(Object.keys(PURPOSES) as [string, ...string[]]),
  mime: z.string().max(120),
  size: z.number().int().positive().max(200 * MB),
  filename: z.string().max(200).optional(),
  isPublic: z.boolean().default(false),
});

const can = (perm: string | null) => perm === null || hasPermission(Ctx.get().permissions ?? [], perm);

@Controller('files')
export class FilesController {
  constructor(private readonly db: DbService, private readonly storage: StorageAdapter) {}

  /**
   * Step 1: get a presigned PUT url. Step 2: client PUTs the bytes directly to object storage.
   * Content-Type and Content-Length are part of the signature, so storage rejects a different type or size.
   */
  @TenantOptional() @Post('upload-url')
  async uploadUrl(@Body(Z(uploadReq)) b: z.infer<typeof uploadReq>) {
    const rule = PURPOSES[b.purpose]!;
    if (!rule.mimes.includes(b.mime)) throw badRequest('File type not allowed for this upload');
    if (b.size > rule.maxBytes) throw badRequest(`File too large (max ${Math.round(rule.maxBytes / MB)} MB)`);
    if (b.isPublic && !rule.publicAllowed) throw badRequest('This kind of file cannot be public');
    const c = Ctx.get();
    if (!can(rule.uploadPerm)) throw forbidden('You cannot upload this kind of file');
    if (rule.uploadPerm && !c.tenantId) throw badRequest('Institution context required');
    const id = uuidv7();
    // Key is built only from server-controlled parts: tenant, whitelisted purpose, generated id, mapped extension.
    const key = `${c.tenantId ?? 'global'}/${b.purpose}/${id}.${MIME_EXT[b.mime]}`;
    await this.db.admin.insert(file).values({ id, tenantId: c.tenantId ?? null, key, mime: b.mime, size: b.size, ownerUserId: c.userId, purpose: b.purpose, isPublic: b.isPublic });
    return { fileId: id, uploadUrl: await this.storage.uploadUrl(key, b.mime, b.size), method: 'PUT', headers: { 'Content-Type': b.mime } };
  }

  /** Signed download URL. Owner always; otherwise same tenant and the purpose's view permission. */
  @TenantOptional() @Get(':id/url')
  async url(@Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('File');
    const c = Ctx.get();
    const [f] = await this.db.admin.select().from(file).where(eq(file.id, id)).limit(1);
    const isOwner = !!f && !!c.userId && f.ownerUserId === c.userId;
    const sameTenant = !!f && !!c.tenantId && f.tenantId === c.tenantId;
    const rule = f ? PURPOSES[f.purpose] : undefined;
    const allowed = isOwner || f?.isPublic || (sameTenant && can(rule ? rule.viewPerm : 'org.settings.edit'));
    // Same 404 for "missing" and "not yours", so ids from other tenants reveal nothing.
    if (!f || !allowed) throw notFound('File');
    return { url: await this.storage.downloadUrl(f.key), mime: f.mime, size: f.size };
  }

  /** Public files (logos, website media) */
  @Public() @Get('public/:id')
  async publicUrl(@Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('File');
    const [f] = await this.db.admin.select().from(file).where(and(eq(file.id, id), eq(file.isPublic, true))).limit(1);
    if (!f) throw notFound('File');
    return { url: await this.storage.downloadUrl(f.key, 86400) };
  }
}
