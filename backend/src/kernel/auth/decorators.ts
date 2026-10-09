import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ModuleKey, PermissionKey } from '@aadhyay/contracts';
import { Ctx } from '../context/request-context';

export const META_PUBLIC = 'aad:public';
export const META_TENANT = 'aad:tenant'; // 'required' | 'optional' | 'none'
export const META_MODULE = 'aad:module';
export const META_PERM = 'aad:perm';
export const META_PLATFORM = 'aad:platform';
export const META_DEVICE = 'aad:device';
export const META_ALLOW_SUSPENDED = 'aad:allow-suspended';
export const META_SCOPED = 'aad:scoped';

/** No login required. Tenant is still resolved from host/X-Tenant when present. */
export const Public = () => SetMetadata(META_PUBLIC, true);
/** Logged-in user, no tenant needed (e.g. messenger, profile). */
export const NoTenant = () => SetMetadata(META_TENANT, 'none');
export const TenantOptional = () => SetMetadata(META_TENANT, 'optional');
/** Controller/handler belongs to a switchable module. */
export const RequireModule = (key: ModuleKey) => SetMetadata(META_MODULE, key);
/**
 * Required permission(s) — any of them. Keys are checked against the catalogue at compile time.
 * Without `@Scoped()`, the user must hold the permission institution-wide; `self.*` always marks a self-service endpoint.
 */
export const Can = (...perms: PermissionKey[]) => SetMetadata(META_PERM, perms);
/**
 * The handler enforces record-level scope itself (via `Authz.assert` / `Authz.where`), so users holding the permission
 * only for assigned sections, subjects or their own records may call it.
 */
export const Scoped = () => SetMetadata(META_SCOPED, true);
/** Control-plane endpoint (platform staff JWT). Optional allowed roles. */
export const Platform = (...roles: string[]) => SetMetadata(META_PLATFORM, roles.length ? roles : ['*']);
/** Attendance/GPS device endpoint authenticated with X-Device-Key. */
export const DeviceAuth = () => SetMetadata(META_DEVICE, true);
/** Works while the tenant is suspended (billing, export, auth). */
export const AllowSuspended = () => SetMetadata(META_ALLOW_SUSPENDED, true);

export const CurrentUserId = createParamDecorator((_: unknown, _ctx: ExecutionContext) => Ctx.get().userId);
/** Public endpoint that still requires a tenant (from Host or X-Tenant) — tenant websites, forms. */
export const PublicTenant = () => (target: any, key?: any, desc?: any) => {
  SetMetadata(META_PUBLIC, true)(target, key, desc);
  SetMetadata(META_TENANT, 'required')(target, key, desc);
};
