// pnpm db:reset — drop and recreate the LOCAL database, then migrate + base seed. Refuses non-local hosts.
//   --yes  skip the confirmation prompt   --demo  also load demo data
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readEnv, run, red, green, bold } from './lib.mjs';

// pg is a backend dependency; resolve it from there rather than adding it to the root package.
const pg = createRequire(join(ROOT, 'backend', 'package.json'))('pg');

const args = new Set(process.argv.slice(2));
const e = { ...readEnv(), ...process.env };
const url = new URL(e.DATABASE_URL ?? '');
const db = url.pathname.slice(1);
if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) || e.NODE_ENV === 'production') {
  console.error(red(`refusing to reset ${url.hostname}/${db}: only local development databases can be reset`));
  process.exit(1);
}
if (!args.has('--yes')) {
  if (!process.stdin.isTTY) { console.error(red('pass --yes to reset non-interactively')); process.exit(1); }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`This DELETES all data in database "${db}" on ${url.host}. Type the database name to continue: `);
  rl.close();
  if (a.trim() !== db) { console.log('aborted'); process.exit(1); }
}
const maint = new URL(url); maint.pathname = '/postgres';
const client = new pg.Client({ connectionString: maint.toString() });
await client.connect();
await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [db]);
await client.query(`DROP DATABASE IF EXISTS "${db}"`);
await client.query(`CREATE DATABASE "${db}"`);
await client.end();
console.log(green(`recreated ${db}`));
const backend = join(ROOT, 'backend');
run('node', ['dist/scripts/migrate.js'], { cwd: backend });
run('node', ['dist/scripts/seed.js'], { cwd: backend });
if (args.has('--demo')) run('node', ['dist/scripts/seed-demo.js'], { cwd: backend });
console.log(bold(green('database reset complete')));
