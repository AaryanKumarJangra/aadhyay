// pnpm health — is every local service answering?
import { tcpOpen, httpOk, green, red } from './lib.mjs';

const checks = [
  ['web', () => httpOk('http://localhost:3000/', 60000)],
  ['api', async () => { try { const r = await fetch('http://localhost:4000/v1/health', { signal: AbortSignal.timeout(3000) }); return r.ok && (await r.json()).ok; } catch { return false; } }],
  ['realtime', () => httpOk('http://localhost:4001/')],
  ['postgres', () => tcpOpen('127.0.0.1', 5432)],
  ['redis', () => tcpOpen('127.0.0.1', 6379)],
  ['minio', () => httpOk('http://localhost:9000/minio/health/live')],
  ['mailpit', () => httpOk('http://localhost:8025/')],
  ['livekit', () => httpOk('http://localhost:7880/')],
  ['coturn', () => tcpOpen('127.0.0.1', 3478)],
];
let down = 0;
for (const [name, fn] of checks) {
  const up = await fn();
  if (!up) down++;
  console.log(`${up ? green('UP  ') : red('DOWN')} ${name}`);
}
process.exit(down ? 1 : 0);
