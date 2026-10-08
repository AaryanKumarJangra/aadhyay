import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ModuleKey } from '@aadhyay/contracts';
import { Ctx } from '../context/request-context';

export const META_PUBLIC = 'aad:public';
export const META_TENANT = 'aad:tenant'; // 'required' | 'optional' | 'none'
export const META_MODULE = 'aad:module';
export const META_PERM = 'aad:perm';
export const META_PLATFORM = 'aad:platform';
export const META_DEVICE = 'aad:device';
export const META_ALLOW_SUSPENDED = 'aad:allow-suspended';

/** No login required. Tenant is still resolved from host/X-Tenant when present. */
export const Public = () => SetMetadata(META_PUBLIC, true);
/** Logged-in user, no tenant needed (e.g. messenger, profile). */
export const NoTenant = () => SetMetadata(META_TENANT, 'none');
export const TenantOptional = () => SetMetadata(META_TENANT, 'optional');
/** Controller/handler belongs to a switchable module. */
export const RequireModule = (key: ModuleKey) => SetMetadata(META_MODULE, key);
/** Required permission(s) — any of them. */
export const Can = (...perms: string[]) => SetMetadata(META_PERM, perms);
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
