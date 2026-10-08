# Repository Structure (measured)
- backend/ — NestJS 12 + Fastify 5, Drizzle ORM; src/{modules(24 dirs),kernel,control-plane,adapters(email,payments,push,sms,storage,turn,whatsapp),realtime,worker,db}; 166 tables; 5 migration files; contracts/ (Zod); test/ (6 e2e files); dist/ (build output)
- frontend/web — Next.js 16.4, React 19.3, Tailwind 4; 31 page.tsx; src/app/{(marketing),app,control,site,track,verify,api}; proxy.ts does host-based routing
- frontend/mobile — Expo, 20 route files in app/, flavours/ (8 files)
- frontend/packages/e2ee — 39 files (X3DH/Double Ratchet/Sender Keys claimed; only e2e-round-trip verified)
- infra/ — prod compose, caddy, livekit.yaml, k6, scripts (not run)
- docs/ — plans/specs (not used as evidence)
- .github/ — 1 file (CI; not inspected in depth)
Dead/unused code not assessed.
