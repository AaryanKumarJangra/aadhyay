import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { Ctx } from './kernel/context/request-context';
import { uuidv7 } from './common/ids';
import { env } from './config/env';

/** Build the HTTP app (used by main.api.ts and e2e tests). */
export async function createApp(opts: { logger?: boolean } = {}) {
  const adapter = new FastifyAdapter({ trustProxy: trustProxySetting(), bodyLimit: 5 * 1024 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { rawBody: true, logger: opts.logger === false ? false : ['error', 'warn', 'log'] });
  const f = app.getHttpAdapter().getInstance();

  // Request context (AsyncLocalStorage) for every request.
  f.addHook('onRequest', (req, _reply, done) => {
    Ctx.run({ requestId: (req.headers['x-request-id'] as string) ?? uuidv7(), ip: req.ip, userAgent: req.headers['user-agent'] }, done);
  });
  // The API serves JSON, PDFs and redirects only: nothing it returns should run scripts or be framed.
  await app.register(helmet as any, {
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors as any, {
    origin: (origin: string | undefined, cb: (e: Error | null, ok: boolean) => void) => {
      if (!origin) return cb(null, true);
      const host = origin.replace(/^https?:\/\//, '').split(':')[0]!;
      const ok = env.NODE_ENV !== 'production' || host === env.APP_BASE_DOMAIN || host.endsWith('.' + env.APP_BASE_DOMAIN);
      cb(null, ok);
    },
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  return app;
}

/** Never trust X-Forwarded-For from arbitrary clients; see env.TRUST_PROXY. */
export function trustProxySetting(): boolean | string {
  // Production: Caddy/web on the private docker network. Dev: the Next.js BFF on localhost.
  const v = env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? 'loopback,linklocal,uniquelocal' : 'loopback');
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}
