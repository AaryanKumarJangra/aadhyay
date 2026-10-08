// pnpm setup — one-shot local bootstrap: .env with fresh secrets, infra up, build, migrate, base seed.
//   --fix-env   also repair placeholder/invalid secrets in an existing .env (other values untouched)
//   --demo      also load demo tenants (pnpm db:seed:demo)
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, ENV_FILE, run, green, bold, yellow } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const fresh = {
  JWT_SECRET: () => randomBytes(48).toString('base64url'),
  ENCRYPTION_KEY: () => `base64:${randomBytes(32).toString('base64')}`,
  PHONE_HASH_PEPPER: () => randomBytes(24).toString('base64url'),
};
const invalid = {
  JWT_SECRET: (v) => !v || v.length < 32 || /REPLACE/.test(v),
  ENCRYPTION_KEY: (v) => !v?.startsWith('base64:') || Buffer.from(v.slice(7), 'base64').length !== 32,
  PHONE_HASH_PEPPER: (v) => !v || v.length < 8 || /REPLACE/.test(v),
};

function writeSecrets(onlyInvalid) {
  let text = readFileSync(ENV_FILE, 'utf8');
  for (const [k, gen] of Object.entries(fresh)) {
    const re = new RegExp(`^${k}=([^\\s#]*)`, 'm');
    const cur = text.match(re)?.[1];
    if (onlyInvalid && !invalid[k](cur)) continue;
    text = re.test(text) ? text.replace(re, `${k}=${gen()}`) : `${text.trimEnd()}\n${k}=${gen()}\n`;
    console.log(yellow(`  generated ${k}`));
  }
  writeFileSync(ENV_FILE, text);
}

console.log(bold('1/5 .env'));
if (!existsSync(ENV_FILE)) { copyFileSync(join(ROOT, '.env.example'), ENV_FILE); writeSecrets(false); console.log(green('  created .env from .env.example')); }
else if (args.has('--fix-env')) writeSecrets(true);
else console.log('  .env exists (left unchanged; use --fix-env to repair invalid secrets)');

console.log(bold('2/5 infrastructure'));
run('docker', ['compose', 'up', '-d', '--wait']);

console.log(bold('3/5 build shared packages + backend'));
run('pnpm', ['--filter', '@aadhyay/contracts', 'build']);
run('pnpm', ['--filter', '@aadhyay/e2ee', 'build']);
run('pnpm', ['--filter', '@aadhyay/backend', 'build']);

console.log(bold('4/5 migrate + base seed'));
run('node', ['dist/scripts/migrate.js'], { cwd: join(ROOT, 'backend') });
run('node', ['dist/scripts/seed.js'], { cwd: join(ROOT, 'backend') });

if (args.has('--demo')) { console.log(bold('5/5 demo data')); run('node', ['dist/scripts/seed-demo.js'], { cwd: join(ROOT, 'backend') }); }
else console.log(bold('5/5 demo data skipped') + ' (pnpm db:seed:demo)');
console.log(green('\nSetup complete. Next: pnpm dev   (then pnpm health)'));
