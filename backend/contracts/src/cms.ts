import { z } from 'zod';
import { BLOCKS } from './cms-blocks';

export const BLOCK_TYPES = BLOCKS.map((b) => b.type) as [string, ...string[]];
export const blockStyle = z.object({
  padding: z.enum(['none', 'sm', 'md', 'lg']).optional(), background: z.enum(['none', 'muted', 'brand-soft', 'brand', 'dark']).optional(),
  align: z.enum(['left', 'center']).optional(), width: z.enum(['narrow', 'normal', 'wide']).optional(), hideOn: z.enum(['none', 'mobile', 'desktop']).optional(),
  anchor: z.string().regex(/^[a-z0-9-]*$/).max(40).optional(),
}).strict();
export const block = z.object({ id: z.string().min(1).max(40), type: z.enum(BLOCK_TYPES), props: z.record(z.string(), z.unknown()).default({}), style: blockStyle.optional() });
export const seoInput = z.object({
  title: z.string().max(70).optional(), description: z.string().max(170).optional(), ogImageFileId: z.string().uuid().optional(),
  noindex: z.boolean().optional(), keywords: z.array(z.string()).optional(),
});
export const pageInput = z.object({
  slug: z.string().regex(/^[a-z0-9-/]*$/).default(''), locale: z.enum(['en', 'hi']).default('en'), title: z.string().min(1),
  blocks: z.array(block).default([]), seo: seoInput.default({}), status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
  publishAt: z.string().datetime().optional(),
});
export const postInput = z.object({
  kind: z.enum(['news', 'blog', 'event', 'gallery']), slug: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(1),
  excerpt: z.string().optional(), body: z.string().optional(), coverFileId: z.string().uuid().optional(), images: z.array(z.string().uuid()).default([]),
  eventStart: z.string().datetime().optional(), eventEnd: z.string().datetime().optional(), seo: seoInput.default({}),
  status: z.enum(['draft', 'published']).default('draft'),
});
export const menuInput = z.object({ key: z.enum(['header', 'footer']), items: z.array(z.object({ label: z.string(), href: z.string(), children: z.array(z.object({ label: z.string(), href: z.string() })).optional() })) });
export const redirectInput = z.object({ fromPath: z.string().startsWith('/'), toPath: z.string(), code: z.union([z.literal(301), z.literal(302)]).default(301) });
export const formSubmit = z.object({ formKey: z.string(), data: z.record(z.string(), z.unknown()), utm: z.record(z.string(), z.string()).default({}), turnstileToken: z.string().optional() });
export const domainInput = z.object({ host: z.string().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/) });
/** Update: every field optional and NO defaults (so a partial update never overwrites slug/blocks). */
export const pageUpdate = z.object({
  slug: z.string().regex(/^[a-z0-9-/]*$/).optional(), locale: z.enum(['en', 'hi']).optional(), title: z.string().min(1).optional(),
  blocks: z.array(block).optional(), seo: seoInput.optional(), status: z.enum(['draft', 'scheduled', 'published']).optional(), publishAt: z.string().datetime().optional(),
});

/** Working copy saved by the builder (never changes the live page). */
export const pageDraft = z.object({ title: z.string().min(1).max(150), blocks: z.array(block).max(200), seo: seoInput.default({}), slug: z.string().regex(/^[a-z0-9-/]*$/).optional() });
export const mediaMeta = z.object({ name: z.string().max(120).optional(), alt: z.string().max(250).optional(), caption: z.string().max(300).optional(), folder: z.string().max(60).optional() });
