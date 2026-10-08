import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventsService } from './kernel/events/events.service';
import { startScheduler } from './worker/scheduler';

/** Worker: outbox dispatcher (all @OnEvent subscribers) + scheduled jobs. Scale horizontally safely. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  app.get(EventsService).start(300);
  startScheduler(app);
  console.log('Aadhyay worker running');
}
void main();
