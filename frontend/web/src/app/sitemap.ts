import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';
import { CITIES } from '@/lib/cities';
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/signup`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/demo`, lastModified: now, priority: 0.6 },
    ...CITIES.map((c) => ({ url: `${SITE_URL}/school-erp/${c}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
