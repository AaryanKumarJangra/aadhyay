import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
export const attendanceRecord = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    subjectType: E.subjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),  // student or staff id
    sectionId: uuid('section_id'),
    date: date('date', { mode: 'string' }).notNull(),
    periodId: uuid('period_id').default("00000000-0000-0000-0000-000000000000").notNull(),  // day-wise uses zero uuid
    status: E.attendanceStatusEnum('status').notNull(),
    mode: E.attendanceModeEnum('mode').default('manual').notNull(),
    deviceId: uuid('device_id'),
    inAt: timestamp('in_at', { withTimezone: true, mode: 'date' }),
    outAt: timestamp('out_at', { withTimezone: true, mode: 'date' }),
    markedBy: text('marked_by'),
    sourceTs: timestamp('source_ts', { withTimezone: true, mode: 'date' }),  // device timestamp (offline sync)
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('attendance_records_tenant_id_subject_type_subject_id_date_period_id_key').on(t.tenantId, t.subjectType, t.subjectId, t.date, t.periodId),
    index('attendance_records_tenant_id_date_section_id_idx').on(t.tenantId, t.date, t.sectionId),
  ],
);

export const attendanceDevice = pgTable(
  'attendance_devices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    branchId: uuid('branch_id'),
    kind: text('kind').notNull(),  // qr_scanner | rfid | face | biometric | gate_app
    name: text('name').notNull(),
    serial: text('serial').notNull(),  // raw
    apiKeyHash: text('api_key_hash').notNull().unique(),  // raw
    isActive: boolean('is_active').default(true).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const leaveRequest = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    subjectType: E.subjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    appliedBy: text('applied_by').notNull(),  // user id
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }).notNull(),
    leaveTypeId: uuid('leave_type_id'),
    reason: text('reason').notNull(),
    status: E.approvalStatusEnum('status').default('pending').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('leave_requests_tenant_id_status_idx').on(t.tenantId, t.status),
  ],
);

export const homework = pgTable(
  'homework',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    teacherId: uuid('teacher_id'),
    title: text('title').notNull(),
    body: text('body'),
    attachments: text('attachments').array().notNull(),
    assignedOn: date('assigned_on', { mode: 'string' }).notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    maxMarks: doublePrecision('max_marks'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('homework_tenant_id_section_id_due_on_idx').on(t.tenantId, t.sectionId, t.dueOn),
  ],
);

export const homeworkSubmission = pgTable(
  'homework_submissions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    homeworkId: uuid('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    files: text('files').array().notNull(),
    text: text('text'),
    status: text('status').default("submitted").notNull(),  // submitted | evaluated | returned
    marks: doublePrecision('marks'),
    feedback: text('feedback'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('homework_submissions_homework_id_student_id_key').on(t.homeworkId, t.studentId),
  ],
);

export const diaryEntry = pgTable(
  'diary_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    body: text('body').notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('diary_entries_tenant_id_section_id_date_idx').on(t.tenantId, t.sectionId, t.date),
  ],
);

export const lesson = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    name: text('name').notNull(),
    order: integer('order').default(0).notNull(),
  },
);

export const topic = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    lessonId: uuid('lesson_id').notNull().references(() => lesson.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sectionId: uuid('section_id'),
    status: text('status').default("pending").notNull(),  // pending | in_progress | completed
    plannedOn: date('planned_on', { mode: 'string' }),
    completedOn: date('completed_on', { mode: 'string' }),
    plan: jsonb('plan').$type<any>().default({}).notNull(),
  },
);

export const gradeScale = pgTable(
  'grade_scales',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    bands: jsonb('bands').$type<any>().notNull(),  // [{grade:"A1", min:91, max:100, point:10, remark:"Outstanding"}]
  },
  (t) => [
    unique('grade_scales_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const examGroup = pgTable(
  'exam_groups',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').default("general").notNull(),  // general | cbse | gpa
  },
);

export const exam = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    groupId: uuid('group_id').notNull().references(() => examGroup.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    term: text('term'),
    weightage: doublePrecision('weightage').default(100).notNull(),
    gradeScaleId: uuid('grade_scale_id'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const examSchedule = pgTable(
  'exam_schedules',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    examId: uuid('exam_id').notNull().references(() => exam.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    date: date('date', { mode: 'string' }),
    startTime: text('start_time'),
    endTime: text('end_time'),
    room: text('room'),
    maxMarks: doublePrecision('max_marks').notNull(),
    passMarks: doublePrecision('pass_marks').notNull(),
  },
  (t) => [
    unique('exam_schedules_exam_id_class_id_subject_id_key').on(t.examId, t.classId, t.subjectId),
  ],
);

export const markEntry = pgTable(
  'mark_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    scheduleId: uuid('schedule_id').notNull().references(() => examSchedule.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    marks: doublePrecision('marks'),
    grade: text('grade'),
    isAbsent: boolean('is_absent').default(false).notNull(),
    remarks: text('remarks'),
    enteredBy: text('entered_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('mark_entries_schedule_id_student_id_key').on(t.scheduleId, t.studentId),
  ],
);

export const result = pgTable(
  'results',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    examId: uuid('exam_id').notNull(),
    studentId: uuid('student_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    totalMarks: doublePrecision('total_marks').notNull(),
    maxMarks: doublePrecision('max_marks').notNull(),
    percentage: doublePrecision('percentage').notNull(),
    grade: text('grade'),
    rank: integer('rank'),
    isPass: boolean('is_pass').notNull(),
    remarks: text('remarks'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('results_exam_id_student_id_key').on(t.examId, t.studentId),
  ],
);

export const reportCardTemplate = pgTable(
  'report_card_templates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').default("general").notNull(),  // general | cbse | hpc
    layout: jsonb('layout').$type<any>().notNull(),
  },
);

export const questionBank = pgTable(
  'question_banks',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    subjectId: uuid('subject_id'),
  },
);

export const question = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    bankId: uuid('bank_id').notNull().references(() => questionBank.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),  // mcq | multi | numeric | matrix | assertion | subjective | truefalse
    body: jsonb('body').$type<any>().notNull(),  // {text, image}
    options: jsonb('options').$type<any>().default([]).notNull(),
    answer: jsonb('answer').$type<any>().notNull(),  // correct option ids / value / rubric
    marks: doublePrecision('marks').default(1).notNull(),
    negative: doublePrecision('negative').default(0).notNull(),
    difficulty: text('difficulty'),
    tags: text('tags').array().notNull(),
  },
);

export const onlineTest = pgTable(
  'online_tests',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    audience: jsonb('audience').$type<any>().notNull(),  // {sectionIds:[], batchIds:[]}
    questionIds: text('question_ids').array().notNull(),
    sections: jsonb('sections').$type<any>().default([]).notNull(),
    durationMin: integer('duration_min').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    shuffle: boolean('shuffle').default(true).notNull(),
    proctoring: jsonb('proctoring').$type<any>().default({}).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const onlineTestAttempt = pgTable(
  'online_test_attempts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    testId: uuid('test_id').notNull().references(() => onlineTest.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    answers: jsonb('answers').$type<any>().default({}).notNull(),
    score: doublePrecision('score'),
    rank: integer('rank'),
    percentile: doublePrecision('percentile'),
    flags: jsonb('flags').$type<any>().default({}).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('online_test_attempts_test_id_student_id_key').on(t.testId, t.studentId),
  ],
);

export const course = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    coverFileId: uuid('cover_file_id'),
    audience: jsonb('audience').$type<any>().default({}).notNull(),
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('courses_tenant_id_slug_key').on(t.tenantId, t.slug),
  ],
);

export const courseModule = pgTable(
  'course_modules',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    courseId: uuid('course_id').notNull().references(() => course.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    order: integer('order').default(0).notNull(),
  },
);

export const content = pgTable(
  'contents',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    moduleId: uuid('module_id').notNull().references(() => courseModule.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),  // pdf | video | link | html | test
    title: text('title').notNull(),
    fileId: uuid('file_id'),
    url: text('url'),
    body: text('body'),
    drm: boolean('drm').default(false).notNull(),
    releaseAt: timestamp('release_at', { withTimezone: true, mode: 'date' }),
    order: integer('order').default(0).notNull(),
  },
);

export const contentProgress = pgTable(
  'content_progress',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    contentId: uuid('content_id').notNull(),
    studentId: uuid('student_id').notNull(),
    progress: doublePrecision('progress').default(0).notNull(),
    completed: boolean('completed').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('content_progress_content_id_student_id_key').on(t.contentId, t.studentId),
  ],
);

export const liveSession = pgTable(
  'live_sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    provider: text('provider').notNull(),  // livekit | zoom | meet
    joinUrl: text('join_url'),
    room: text('room'),
    audience: jsonb('audience').$type<any>().notNull(),
    hostStaffId: uuid('host_staff_id'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMin: integer('duration_min').notNull(),
    recordingFileId: uuid('recording_file_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const liveAttendance = pgTable(
  'live_attendance',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    userId: uuid('user_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull(),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('live_attendance_tenant_id_session_id_idx').on(t.tenantId, t.sessionId),
  ],
);
