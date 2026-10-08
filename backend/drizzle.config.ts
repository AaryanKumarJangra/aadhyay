import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
for (const p of ['.env', '../.env']) if (existsSync(p)) process.loadEnvFile(p);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
});
