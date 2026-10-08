import { z } from 'zod';
import { isoDate, phoneIN } from './common';

export const signupTenant = z.object({
  institutionName: z.string().min(3).max(150),
  segment: z.enum(['school', 'college', 'institute', 'coaching', 'creator']),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'lowercase letters, digits and hyphens').optional(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  stateCode: z.string().regex(/^\d{2}$/).default('09'),
  ownerName: z.string().min(2).max(120),
  ownerPhone: phoneIN,
  ownerEmail: z.string().email().optional(),
  approxStudents: z.number().int().min(1).max(200000).optional(),
});
export const branchInput = z.object({
  name: z.string().min(2),
  code: z.string().min(1).max(20),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isMain: z.boolean().optional(),
});
export const sessionInput = z.object({ name: z.string().min(4), startsOn: isoDate, endsOn: isoDate, isCurrent: z.boolean().optional() });
export const brandingInput = z.object({
  logoFileId: z.string().uuid().optional(),
  faviconFileId: z.string().uuid().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tagline: z.string().max(200).optional(),
  affiliation: z.string().max(100).optional(), // e.g. CBSE Aff. No.
  address: z.string().max(300).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  signatureFileId: z.string().uuid().optional(),
  sealFileId: z.string().uuid().optional(),
});
export const roleInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1),
});
export const inviteMember = z.object({
  phone: phoneIN,
  name: z.string().min(1),
  kind: z.enum(['staff', 'student', 'guardian', 'alumni']).default('staff'),
  personId: z.string().uuid().optional(),
  roleKeys: z.array(z.string()).default([]),
  scopeKind: z.enum(['tenant', 'branch', 'class', 'section', 'own']).default('tenant'),
  scopeId: z.string().uuid().optional(),
});
