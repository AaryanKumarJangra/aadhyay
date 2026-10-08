import { createApp } from './bootstrap';
import { env } from './config/env';

async function main() {
  const app = await createApp();
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Aadhyay API on :${env.API_PORT}/v1`);
}
void main();
