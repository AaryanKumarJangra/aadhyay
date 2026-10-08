import { NextResponse, type NextRequest } from 'next/server';

const BASE = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'aadhyay.com';
const SHARED = /^\/(api|_next|track|verify)(\/|$)|\.(?:png|jpe?g|svg|ico|webp|avif|js|css|woff2?|map)$/;

/**
 * Host-based routing (docs/02 §10):
 *   aadhyay.com / www / localhost           → marketing (as-is)
 *   app.aadhyay.com                        → /app/*   (institution console)
 *   control.aadhyay.com                    → /control/*
 *   <slug>.aadhyay.com or a custom domain  → /site/<host>/*  (tenant website)
 * Local dev: use paths directly (/app, /control, /site/<slug>).
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0]!.toLowerCase();
  const url = req.nextUrl.clone();
  const p = url.pathname;
  if (host === BASE || host === `www.${BASE}` || host === 'localhost' || host === '127.0.0.1' || SHARED.test(p)) return NextResponse.next();
  if (host === `app.${BASE}`) { if (!p.startsWith('/app')) url.pathname = `/app${p}`; return NextResponse.rewrite(url); }
  if (host === `control.${BASE}`) { if (!p.startsWith('/control')) url.pathname = `/control${p}`; return NextResponse.rewrite(url); }
  const key = host.endsWith(`.${BASE}`) ? host.slice(0, -(BASE.length + 1)) : host;
  url.pathname = p === '/sitemap.xml' ? `/site/${key}/sitemap.xml` : p === '/robots.txt' ? `/site/${key}/robots.txt` : `/site/${key}${p === '/' ? '' : p}`;
  return NextResponse.rewrite(url);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
