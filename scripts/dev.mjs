// pnpm dev — runs the whole local platform with prefixed logs. Ctrl+C stops everything.
//   --only=backend | api | realtime | worker | web   (comma list)
import { join } from 'node:path';
import { ROOT, run, spawnPrefixed, bold } from './lib.mjs';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (n) => !only || only.includes(n) || (only.includes('backend') && ['api', 'realtime', 'worker'].includes(n));
const backend = join(ROOT, 'backend');
const needBackend = ['api', 'realtime', 'worker'].some(want);

if (needBackend) {
  // Build once so node --watch has something to run, then keep tsc watching.
  run('pnpm', ['--filter', '@aadhyay/contracts', 'build']);
  run('pnpm', ['--filter', '@aadhyay/e2ee', 'build']);
  run('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: backend });
}
const kids = [];
if (needBackend) kids.push(spawnPrefixed('tsc', 90, 'npx', ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], { cwd: backend }));
if (want('api')) kids.push(spawnPrefixed('api', 36, 'node', ['--watch', 'dist/main.api.js'], { cwd: backend }));
if (want('realtime')) kids.push(spawnPrefixed('realtime', 35, 'node', ['--watch', 'dist/main.realtime.js'], { cwd: backend }));
if (want('worker')) kids.push(spawnPrefixed('worker', 33, 'node', ['--watch', 'dist/main.worker.js'], { cwd: backend }));
// webpack: Turbopack cannot resolve pnpm symlinks on NTFS/exFAT and similar filesystems.
if (want('web')) kids.push(spawnPrefixed('web', 32, 'npx', ['next', 'dev', '--webpack', '-p', '3000'], { cwd: join(ROOT, 'frontend/web') }));

console.log(bold(`\nstarted: ${kids.length} processes — web http://localhost:3000 · api http://localhost:4000/v1 · realtime :4001\n`));
const stop = () => { for (const k of kids) k.kill('SIGTERM'); setTimeout(() => process.exit(0), 1500); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const k of kids) k.on('exit', (code) => { if (code && code !== 0 && code !== null) console.error(`process exited with ${code}`); });
