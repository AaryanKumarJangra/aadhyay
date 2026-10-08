import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Loads backend/.env or repo-root .env (first found) without overriding real env vars. */
export function loadEnv() {
  for (const p of [join(process.cwd(), '.env'), join(process.cwd(), '..', '.env')]) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      return;
    }
  }
}
