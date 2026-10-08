// pnpm doctor — checks the toolchain, .env and local infrastructure, and says how to fix each problem.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ENV_FILE, readEnv, capture, tcpOpen, httpOk, green, red, yellow, bold } from './lib.mjs';

let failures = 0;
const ok = (m) => console.log(`${green('✔')} ${m}`);
const warn = (m) => console.log(`${yellow('!')} ${m}`);
const bad = (m, fix) => { failures++; console.log(`${red('✘')} ${m}${fix ? `\n    → ${fix}` : ''}`); };

console.log(bold('Toolchain'));
const [maj] = process.versions.node.split('.').map(Number);
maj >= 22 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node} (need ≥ 22)`, 'install Node 22+ (nvm install 22)');
const pnpm = capture('pnpm', ['-v']);
pnpm.status === 0 ? ok(`pnpm ${pnpm.stdout.trim()}`) : bad('pnpm not found', 'corepack enable');
const docker = capture('docker', ['compose', 'version']);
docker.status === 0 ? ok('docker compose available') : bad('docker compose not available', 'install Docker Engine + compose plugin');

console.log(bold('\nEnvironment (.env)'));
if (!existsSync(ENV_FILE)) bad('.env missing', 'pnpm setup   (creates .env with fresh local secrets)');
else {
  const e = readEnv();
  const need = { DATABASE_URL: (v) => !!v, APP_DATABASE_URL: (v) => !!v, JWT_SECRET: (v) => v && v.length >= 32 && !/REPLACE/.test(v), PHONE_HASH_PEPPER: (v) => v && v.length >= 8 && !/REPLACE/.test(v) };
  for (const [k, test] of Object.entries(need)) test(e[k]) ? ok(k) : bad(`${k} missing or placeholder`, 'pnpm setup --fix-env');
  const key = e.ENCRYPTION_KEY ?? '';
  const bytes = key.startsWith('base64:') ? Buffer.from(key.slice(7), 'base64').length : 0;
  bytes === 32 ? ok('ENCRYPTION_KEY (32 bytes)') : bad('ENCRYPTION_KEY must be base64:<32 random bytes>', 'pnpm setup --fix-env   (or: echo "base64:$(openssl rand -base64 32)")');
  if (e.NODE_ENV === 'production') warn('NODE_ENV=production in a local .env');
}

console.log(bold('\nFilesystem'));
const fs = capture('findmnt', ['-n', '-o', 'FSTYPE', '-T', ROOT]);
const fstype = fs.stdout?.trim();
if (/ntfs|fuseblk|vfat|exfat/i.test(fstype ?? '')) warn(`repo is on ${fstype}: Turbopack cannot follow pnpm symlinks here, so web dev uses webpack (already configured)`);
else ok(`filesystem ${fstype || 'unknown'}`);
existsSync(join(ROOT, 'node_modules')) ? ok('dependencies installed') : bad('node_modules missing', 'pnpm install');
existsSync(join(ROOT, 'backend/dist/main.api.js')) ? ok('backend built') : warn('backend not built yet (pnpm setup builds it)');

console.log(bold('\nInfrastructure'));
const checks = [['postgres', 'tcp', 5432], ['redis', 'tcp', 6379], ['minio', 'http', 'http://localhost:9000/minio/health/live'], ['mailpit', 'http', 'http://localhost:8025'], ['livekit', 'http', 'http://localhost:7880'], ['coturn', 'tcp', 3478]];
for (const [name, kind, target] of checks) {
  const up = kind === 'tcp' ? await tcpOpen('127.0.0.1', target) : await httpOk(target);
  up ? ok(name) : bad(`${name} not reachable`, 'docker compose up -d --wait');
}
const mem = capture('free', ['-m']).stdout?.split('\n')[1]?.split(/\s+/);
if (mem && Number(mem[6]) < 2500) warn(`only ${mem[6]} MB RAM available — run fewer processes (e.g. pnpm dev:api + pnpm dev:web) if things get killed`);

console.log(failures ? red(`\n${failures} problem(s) found`) : green('\nAll checks passed'));
process.exit(failures ? 1 : 0);
