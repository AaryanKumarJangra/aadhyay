import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
export const branch = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    city: text('city'),
    phone: text('phone'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    isMain: boolean('is_main').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('branches_tenant_id_code_key').on(t.tenantId, t.code),
  ],
);

export const academicSession = pgTable(
  'academic_sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),  // 2026-27
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    isCurrent: boolean('is_current').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('academic_sessions_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const customFieldDef = pgTable(
  'custom_field_defs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    entity: text('entity').notNull(),  // student | staff | guardian | lead
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull(),  // text | number | date | select | boolean
    options: text('options').array().notNull(),
    required: boolean('required').default(false).notNull(),
    order: integer('order').default(0).notNull(),
  },
  (t) => [
    unique('custom_field_defs_tenant_id_entity_key_key').on(t.tenantId, t.entity, t.key),
  ],
);

export const student = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    branchId: uuid('branch_id'),
    admissionNo: text('admission_no').notNull(),
    name: text('name').notNull(),
    dob: date('dob', { mode: 'string' }),
    gender: E.genderEnum('gender'),
    category: text('category'),  // general | obc | sc | st | ews
    house: text('house'),
    bloodGroup: text('blood_group'),
    religion: text('religion'),
    address: text('address'),
    apaarId: text('apaar_id'),  // raw
    rte: boolean('rte').default(false).notNull(),
    phone: text('phone'),
    email: text('email'),
    photoFileId: uuid('photo_file_id'),
    qrCode: text('qr_code'),  // raw — attendance QR / RFID uid
    rfidUid: text('rfid_uid'),  // raw
    status: E.personStatusEnum('status').default('active').notNull(),
    admittedOn: date('admitted_on', { mode: 'string' }),
    leftOn: date('left_on', { mode: 'string' }),
    leftReason: text('left_reason'),
    userId: uuid('user_id'),  // student login
    custom: jsonb('custom').$type<any>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('students_tenant_id_admission_no_key').on(t.tenantId, t.admissionNo),
    index('students_tenant_id_name_idx').on(t.tenantId, t.name),
  ],
);

export const guardian = pgTable(
  'guardians',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    occupation: text('occupation'),
    address: text('address'),
    userId: uuid('user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('guardians_tenant_id_phone_key').on(t.tenantId, t.phone),
  ],
);

export const studentGuardian = pgTable(
  'student_guardians',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').notNull().references(() => guardian.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull(),  // father | mother | guardian ...
    isPrimary: boolean('is_primary').default(false).notNull(),
    receivesNotifications: boolean('receives_notifications').default(true).notNull(),
  },
  (t) => [
    unique('student_guardians_student_id_guardian_id_key').on(t.studentId, t.guardianId),
    index('student_guardians_tenant_id_guardian_id_idx').on(t.tenantId, t.guardianId),
  ],
);

export const department = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    unique('departments_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const designation = pgTable(
  'designations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    unique('designations_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    branchId: uuid('branch_id'),
    employeeCode: text('employee_code').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    gender: E.genderEnum('gender'),
    dob: date('dob', { mode: 'string' }),
    departmentId: uuid('department_id'),
    designationId: uuid('designation_id'),
    joiningDate: date('joining_date', { mode: 'string' }),
    qualification: text('qualification'),
    address: text('address'),
    bankAccount: jsonb('bank_account').$type<any>().default({}).notNull(),  // encrypted fields inside
    photoFileId: uuid('photo_file_id'),
    rfidUid: text('rfid_uid'),  // raw
    status: E.personStatusEnum('status').default('active').notNull(),
    userId: uuid('user_id'),
    custom: jsonb('custom').$type<any>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('staff_tenant_id_employee_code_key').on(t.tenantId, t.employeeCode),
  ],
);

export const document = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    ownerType: text('owner_type').notNull(),  // student | staff
    ownerId: uuid('owner_id').notNull(),
    kind: text('kind').notNull(),
    fileId: uuid('file_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('documents_tenant_id_owner_type_owner_id_idx').on(t.tenantId, t.ownerType, t.ownerId),
  ],
);

export const schoolClass = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    order: integer('order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('classes_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const section = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    classId: uuid('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    classTeacherId: uuid('class_teacher_id'),  // staff id
    capacity: integer('capacity'),
  },
  (t) => [
    unique('sections_tenant_id_class_id_name_key').on(t.tenantId, t.classId, t.name),
  ],
);

export const subject = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    code: text('code'),
    type: text('type').default("theory").notNull(),  // theory | practical | co_scholastic
  },
  (t) => [
    unique('subjects_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const classSubject = pgTable(
  'class_subjects',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    classId: uuid('class_id').notNull(),
    sectionId: uuid('section_id'),
    subjectId: uuid('subject_id').notNull(),
    teacherId: uuid('teacher_id'),  // staff id
  },
  (t) => [
    unique('class_subjects_tenant_id_class_id_section_id_subject_id_key').on(t.tenantId, t.classId, t.sectionId, t.subjectId),
  ],
);

export const enrollment = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    classId: uuid('class_id').notNull(),
    sectionId: uuid('section_id').notNull().references(() => section.id),
    rollNo: text('roll_no'),
    status: text('status').default("active").notNull(),  // active | promoted | detained | left
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('enrollments_tenant_id_student_id_session_id_key').on(t.tenantId, t.studentId, t.sessionId),
    index('enrollments_tenant_id_section_id_idx').on(t.tenantId, t.sectionId),
  ],
);

export const period = pgTable(
  'periods',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    startsAt: text('starts_at').notNull(),  // HH:mm
    endsAt: text('ends_at').notNull(),
    order: integer('order').notNull(),
  },
  (t) => [
    unique('periods_tenant_id_order_key').on(t.tenantId, t.order),
  ],
);

export const timetableSlot = pgTable(
  'timetable_slots',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    weekday: integer('weekday').notNull(),  // 1=Mon..7
    periodId: uuid('period_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    teacherId: uuid('teacher_id'),
    room: text('room'),
  },
  (t) => [
    unique('timetable_slots_tenant_id_section_id_weekday_period_id_key').on(t.tenantId, t.sectionId, t.weekday, t.periodId),
    index('timetable_slots_tenant_id_teacher_id_weekday_idx').on(t.tenantId, t.teacherId, t.weekday),
  ],
);

export const substitution = pgTable(
  'substitutions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    slotId: uuid('slot_id').notNull(),
    absentTeacherId: uuid('absent_teacher_id').notNull(),
    substituteTeacherId: uuid('substitute_teacher_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const calendarEvent = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),  // holiday | event | ptm | exam | vacation
    title: text('title').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    appliesTo: jsonb('applies_to').$type<any>().default({"all":true}).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('calendar_events_tenant_id_starts_on_idx').on(t.tenantId, t.startsOn),
  ],
);
