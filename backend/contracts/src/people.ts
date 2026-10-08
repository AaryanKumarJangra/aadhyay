import { z } from 'zod';
import { isoDate, phoneIN } from './common';

export const guardianInput = z.object({
  name: z.string().min(1).max(120),
  phone: phoneIN,
  email: z.string().email().optional(),
  relation: z.string().default('guardian'),
  occupation: z.string().optional(),
  isPrimary: z.boolean().default(false),
  receivesNotifications: z.boolean().default(true),
});
export const studentInput = z.object({
  admissionNo: z.string().min(1).max(40).optional(), // auto-generated if absent
  name: z.string().min(1).max(120),
  dob: isoDate.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  category: z.string().optional(),
  house: z.string().optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
  apaarId: z.string().optional(),
  rte: z.boolean().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  branchId: z.string().uuid().optional(),
  admittedOn: isoDate.optional(),
  sectionId: z.string().uuid().optional(), // enrol into current session
  rollNo: z.string().optional(),
  guardians: z.array(guardianInput).default([]),
  custom: z.record(z.string(), z.unknown()).optional(),
});
export const studentUpdate = studentInput.omit({ guardians: true, sectionId: true }).partial().extend({
  status: z.enum(['active', 'inactive', 'left', 'alumni']).optional(),
  leftReason: z.string().optional(),
});
export const staffInput = z.object({
  employeeCode: z.string().min(1).max(40).optional(),
  name: z.string().min(1),
  phone: phoneIN,
  email: z.string().email().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dob: isoDate.optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  joiningDate: isoDate.optional(),
  qualification: z.string().optional(),
  branchId: z.string().uuid().optional(),
  roleKeys: z.array(z.string()).default([]),
  createLogin: z.boolean().default(true),
});
export const studentImportRow = studentInput.extend({
  className: z.string().optional(),
  sectionName: z.string().optional(),
  fatherName: z.string().optional(),
  fatherPhone: z.string().optional(),
  motherName: z.string().optional(),
  motherPhone: z.string().optional(),
});
