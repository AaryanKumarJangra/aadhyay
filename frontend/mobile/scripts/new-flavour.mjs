#!/usr/bin/env node
// Scaffold a flavour locally: node scripts/new-flavour.mjs <slug> "<App Name>" <com.aadhyay.package> <#primary>
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
const [slug, name, pkg, primary = '#1E40AF'] = process.argv.slice(2);
if (!slug || !name || !pkg) throw new Error('usage: <slug> "<App Name>" <package> [#primary]');
mkdirSync(`flavours/${slug}`, { recursive: true });
writeFileSync(`flavours/${slug}/flavour.json`, JSON.stringify({ slug, name, tenantSlug: slug, android: { package: pkg, sha256: [] }, ios: { bundleIdentifier: pkg }, colors: { primary, accent: '#F59E0B' }, apiBaseUrl: 'https://api.aadhyay.com', realtimeUrl: 'https://rt.aadhyay.com', websiteHost: `${slug}.aadhyay.com`, deepLinkHosts: [`${slug}.aadhyay.com`] }, null, 2));
for (const f of ['icon.png', 'adaptive-icon.png', 'splash.png']) copyFileSync(`flavours/aadhyay/${f}`, `flavours/${slug}/${f}`);
console.log(`Created flavours/${slug}. Replace the icons, register the upload key's SHA-256 in the control plane, then build.`);
