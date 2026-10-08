import 'server-only';
import { api } from './server-api';

/** Tenant website data (ISR: cached 5 min, invalidated on publish via tag `site:<key>`). */
export const getSite = (host: string) => api(`/site`, { tenant: host, auth: false, revalidate: 300, tags: [`site:${host}`] });
export const getPage = (host: string, slug: string, locale = 'en') => api(`/site/page?slug=${encodeURIComponent(slug)}&locale=${locale}`, { tenant: host, auth: false, revalidate: 300, tags: [`site:${host}`] });
export const getPosts = (host: string, kind: string) => api(`/site/posts/${kind}`, { tenant: host, auth: false, revalidate: 300, tags: [`site:${host}`] });
export const getPost = (host: string, kind: string, slug: string) => api(`/site/posts/${kind}/${slug}`, { tenant: host, auth: false, revalidate: 300, tags: [`site:${host}`] });
