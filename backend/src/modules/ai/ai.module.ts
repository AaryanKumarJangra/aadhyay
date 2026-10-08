import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../db/db.service';
import { aiRequest } from '../../db/schema';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { AppError } from '../../common/errors';
import { BillingService } from '../../control-plane/billing.service';

const PROMPTS: Record<string, (i: any) => string> = {
  remark: (i) => `Write a warm, specific ${i.locale === 'hi' ? 'Hindi' : 'English'} report-card remark (max 40 words) for a student. Facts: ${JSON.stringify(i.facts)}. No names other than "${i.firstName}". No negative labels.`,
  circular: (i) => `Draft a short school circular in ${i.locale === 'hi' ? 'Hindi' : 'English'} for parents. Topic: ${i.topic}. Details: ${i.details}. Polite, clear, under 120 words.`,
  translate: (i) => `Translate to ${i.to === 'hi' ? 'Hindi' : 'English'}, keep names and numbers unchanged. Text:\n${i.text}`,
  questions: (i) => `Create ${i.count} ${i.type} questions for class ${i.className} ${i.subject}, chapter "${i.chapter}", difficulty ${i.difficulty}. Return JSON array [{text, options:[{id,text}], answer, explanation}]. Cite the chapter.`,
};

/**
 * Provider-agnostic AI gateway (docs/02 §1, master plan §12.3). Any OpenAI-compatible endpoint via env:
 * AI_BASE_URL, AI_API_KEY, AI_MODEL. Drafts only — a human approves before anything is published.
 * Strips personal data by design: callers pass first names and aggregate facts only.
 */
@Injectable()
export class AiService {
  constructor(private readonly db: DbService, private readonly billing: BillingService) {}
  async complete(feature: keyof typeof PROMPTS, input: any) {
    const base = process.env.AI_BASE_URL, key = process.env.AI_API_KEY, model = process.env.AI_MODEL;
    if (!base || !key || !model) throw new AppError('BAD_REQUEST', 'AI provider is not configured for this installation (set AI_BASE_URL, AI_API_KEY, AI_MODEL).');
    const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.4, max_tokens: 800, messages: [{ role: 'system', content: 'You assist Indian school staff. Be accurate, respectful and concise.' }, { role: 'user', content: PROMPTS[feature]!(input) }] }),
    });
    const j = (await res.json()) as any;
    if (!res.ok) throw new AppError('BAD_REQUEST', `AI provider error: ${j?.error?.message ?? res.status}`);
    const tin = j.usage?.prompt_tokens ?? 0, tout = j.usage?.completion_tokens ?? 0;
    const costPaise = Math.ceil(((tin + tout) / 1000) * Number(process.env.AI_PAISE_PER_1K_TOKENS ?? 5));
    await this.db.t((tx) => tx.insert(aiRequest).values({ tenantId: Ctx.tenantId(), userId: Ctx.userId(), feature, provider: model, tokensIn: tin, tokensOut: tout, costPaise }));
    await this.billing.debitUsage(Ctx.tenantId(), 'ai_tokens', tin + tout, costPaise / Math.max(1, tin + tout), costPaise / Math.max(1, tin + tout), feature);
    return { draft: j.choices?.[0]?.message?.content ?? '', tokens: tin + tout, note: 'AI draft — please review before publishing.' };
  }
}

@RequireModule('ai') @Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}
  @Can('ai.copilot.create', 'exams.marks.create') @Post('remark') remark(@Body(Z(z.object({ firstName: z.string(), facts: z.record(z.string(), z.unknown()), locale: z.enum(['en', 'hi']).default('en') }))) b: any) { return this.svc.complete('remark', b); }
  @Can('ai.copilot.create', 'comms.notice.create') @Post('circular') circular(@Body(Z(z.object({ topic: z.string(), details: z.string(), locale: z.enum(['en', 'hi']).default('en') }))) b: any) { return this.svc.complete('circular', b); }
  @Can('ai.copilot.create', 'comms.notice.create') @Post('translate') translate(@Body(Z(z.object({ text: z.string().max(4000), to: z.enum(['en', 'hi']) }))) b: any) { return this.svc.complete('translate', b); }
  @Can('ai.copilot.create', 'online-exams.bank.create') @Post('questions') questions(@Body(Z(z.object({ className: z.string(), subject: z.string(), chapter: z.string(), type: z.enum(['mcq', 'numeric', 'subjective']).default('mcq'), count: z.number().int().min(1).max(20).default(5), difficulty: z.enum(['easy', 'medium', 'hard']).default('medium') }))) b: any) { return this.svc.complete('questions', b); }
}
@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
