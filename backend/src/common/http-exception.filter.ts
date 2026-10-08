import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('HTTP');
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof ZodError) {
      return reply.status(422).send({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: exception.issues } });
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse() as any;
      const status = exception.getStatus();
      if (body?.error?.code) return reply.status(status).send(body);
      const code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST';
      return reply.status(status).send({ error: { code, message: typeof body === 'string' ? body : body?.message ?? exception.message } });
    }
    const pgCode = (exception as any)?.code ?? (exception as any)?.cause?.code;
    if (pgCode === '23505') {
      // Report which field clashed, never the stored value (it may belong to another tenant or person).
      const detail = String((exception as any)?.cause?.detail ?? (exception as any)?.detail ?? '');
      const fields = detail.match(/^Key \(([^)]+)\)=/)?.[1]?.split(',').map((f) => f.trim());
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'Already exists', ...(fields ? { details: { fields } } : {}) } });
    }
    // Malformed ids / dates / numbers in the URL or body reach Postgres as invalid casts: a client error, not a 500.
    if (pgCode === '22P02' || pgCode === '22007' || pgCode === '22008' || pgCode === '22003') return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid identifier or value' } });
    if (pgCode === '23503') return reply.status(422).send({ error: { code: 'VALIDATION_FAILED', message: 'Referenced record does not exist' } });
    if (pgCode === '42501') return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Row-level security violation' } });
    this.log.error(exception instanceof Error ? exception.stack : String(exception));
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
}
