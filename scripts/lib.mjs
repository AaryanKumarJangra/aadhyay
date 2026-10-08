// Shared helpers for the developer scripts (no dependencies beyond Node 22).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = join(ROOT, '.env');
const c = (n) => (s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
export const green = c(32), red = c(31), yellow = c(33), dim = c(2), bold = c(1);

export function readEnv(file = ENV_FILE) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=([^#\s]*)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Run a command, streaming output; throws on non-zero exit. */
export function run(cmd, args, opts = {}) {
  console.log(dim(`$ ${cmd} ${args.join(' ')}`));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
}
export const capture = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...opts });

export function tcpOpen(host, port, timeoutMs = 1500) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); res(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

export async function httpOk(url, timeoutMs = 3000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    return r.status < 500 ? r.status : false;
  } catch { return false; }
}

/** Long-running child with a coloured name prefix on every line. */
export function spawnPrefixed(name, color, cmd, args, opts = {}) {
  const tag = c(color)(name.padEnd(9));
  const child = spawn(cmd, args, { cwd: ROOT, ...opts, env: { ...process.env, FORCE_COLOR: '1', ...(opts.env ?? {}) } });
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) out.write(`${tag} ${l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
}
