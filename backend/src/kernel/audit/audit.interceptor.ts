import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { FastifyRequest } from 'fastify';
import { AuditService } from './audit.service';
import { Ctx } from '../context/request-context';

/** Records every successful mutating request in a tenant context. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(ec: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ec.getType() !== 'http') return next.handle();
    const req = ec.switchToHttp().getRequest<FastifyRequest>();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next.handle();
    const route = (req as any).routeOptions?.url ?? req.url;
    if (/\/(auth|webhooks|messenger|public)\//.test(route)) return next.handle();
    return next.handle().pipe(
      tap((res: any) => {
        const ctx = Ctx.maybe();
        if (!ctx?.tenantId) return;
        const entityId = (req.params as any)?.id ?? res?.id ?? null;
        void this.audit.record(`${req.method} ${route}`, route.split('/')[2] ?? 'unknown', entityId, { params: req.params, body: req.body }).catch(() => undefined);
      }),
    );
  }
}
