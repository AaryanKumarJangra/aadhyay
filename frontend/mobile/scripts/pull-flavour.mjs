#!/usr/bin/env node
// Usage: CONTROL_TOKEN=... API_URL=https://api.aadhyay.com node scripts/pull-flavour.mjs <tenant-slug>
// Pulls flavour.json from the control plane and writes flavours/<slug>/flavour.json.
// Then add icon.png / adaptive-icon.png / splash.png (1024x1024 / 1242x2436) and run:
//   FLAVOUR=<slug> eas build -p android --profile production
import { writeFileSync, mkdirSync } from 'node:fs';
const slug = process.argv[2];
if (!slug) throw new Error('slug required');
const r = await fetch(`${process.env.API_URL}/v1/control/flavours/${slug}/config`, { headers: { authorization: `Bearer ${process.env.CONTROL_TOKEN}` } });
if (!r.ok) throw new Error(`control plane ${r.status}`);
const j = await r.json();
mkdirSync(`flavours/${slug}`, { recursive: true });
writeFileSync(`flavours/${slug}/flavour.json`, JSON.stringify({ ...j, realtimeUrl: j.apiBaseUrl.replace('api.', 'rt.'), deepLinkHosts: [j.websiteHost] }, null, 2));
console.log(`flavours/${slug}/flavour.json written. Add icons, then: FLAVOUR=${slug} eas build -p android`);
