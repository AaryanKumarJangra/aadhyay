import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const realtime = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001';
const livekit = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? 'ws://localhost:7880';
const storage = process.env.NEXT_PUBLIC_STORAGE_ORIGIN ?? (dev ? 'http://localhost:9000' : '');
const ws = (u: string) => u.replace(/^http/, 'ws');

/**
 * Content-Security-Policy. Static/ISR pages cannot carry per-request nonces, so inline scripts are allowed;
 * tenant HTML is sanitised server-side (lib/sanitize.ts), and everything else is locked to known origins.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${api} ${storage}`.trim(),
  `media-src 'self' blob: https: ${storage}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${realtime} ${ws(realtime)} ${livekit} ${livekit.replace(/^ws/, 'http')} ${storage} https://tile.openstreetmap.org https://*.razorpay.com${dev ? ' ws://localhost:3000' : ''}`.replace(/\s+/g, ' ').trim(),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  // forbidden()/unauthorized() from next/navigation: API 403s render app/forbidden.tsx instead of a 500.
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  transpilePackages: ['@aadhyay/contracts', '@aadhyay/e2ee'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }], formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: csp },
        ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
      ],
    }];
  },
};
export default config;
