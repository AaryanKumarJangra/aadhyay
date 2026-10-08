import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
import { student } from './people_academics';
export const vehicle = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    regNo: text('reg_no').notNull(),
    name: text('name'),
    capacity: integer('capacity').notNull(),
    gpsDeviceId: text('gps_device_id'),  // raw
    driverStaffId: uuid('driver_staff_id'),
    attendantStaffId: uuid('attendant_staff_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('vehicles_tenant_id_reg_no_key').on(t.tenantId, t.regNo),
  ],
);

export const route = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    vehicleId: uuid('vehicle_id'),  // default vehicle
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('routes_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const stop = pgTable(
  'stops',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    routeId: uuid('route_id').notNull().references(() => route.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    order: integer('order').notNull(),
    pickupTime: text('pickup_time'),  // HH:mm
    dropTime: text('drop_time'),
    feePaise: bigint('fee_paise', { mode: 'number' }).default(0).notNull(),
  },
);

export const studentTransport = pgTable(
  'student_transports',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
    direction: E.tripDirectionEnum('direction').notNull(),
    routeId: uuid('route_id').notNull(),
    stopId: uuid('stop_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (t) => [
    unique('student_transports_student_id_direction_key').on(t.studentId, t.direction),
    index('student_transports_tenant_id_vehicle_id_direction_idx').on(t.tenantId, t.vehicleId, t.direction),
  ],
);

export const trip = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    routeId: uuid('route_id').notNull(),
    direction: E.tripDirectionEnum('direction').notNull(),
    driverUserId: uuid('driver_user_id'),
    status: E.tripStatusEnum('status').default('running').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    distanceM: doublePrecision('distance_m').default(0).notNull(),
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    lastAt: timestamp('last_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('trips_tenant_id_vehicle_id_started_at_idx').on(t.tenantId, t.vehicleId, t.startedAt),
  ],
);

export const locationPing = pgTable(
  'location_pings',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [
    index('location_pings_trip_id_at_idx').on(t.tripId, t.at),
  ],
);

export const tripEvent = pgTable(
  'trip_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),  // boarded | dropped | near_stop | arrived_stop | sos | overspeed | started | ended
    studentId: uuid('student_id'),
    stopId: uuid('stop_id'),
    data: jsonb('data').$type<any>().default({}).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('trip_events_tenant_id_trip_id_idx').on(t.tenantId, t.tripId),
  ],
);

export const trackingLink = pgTable(
  'tracking_links',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    guardianId: uuid('guardian_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    studentIds: text('student_ids').array().notNull(),
    tokenHash: text('token_hash').notNull().unique(),  // raw
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('tracking_links_trip_id_guardian_id_key').on(t.tripId, t.guardianId),
  ],
);

export const hostel = pgTable(
  'hostels',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').default("boys").notNull(),  // boys | girls | mixed
    wardenStaffId: uuid('warden_staff_id'),
  },
);

export const hostelRoom = pgTable(
  'hostel_rooms',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    hostelId: uuid('hostel_id').notNull().references(() => hostel.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    roomType: text('room_type').default("standard").notNull(),
    beds: integer('beds').notNull(),
    feePaise: bigint('fee_paise', { mode: 'number' }).default(0).notNull(),
  },
  (t) => [
    unique('hostel_rooms_hostel_id_number_key').on(t.hostelId, t.number),
  ],
);

export const hostelAllocation = pgTable(
  'hostel_allocations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    roomId: uuid('room_id').notNull(),
    studentId: uuid('student_id').notNull(),
    bedNo: integer('bed_no'),
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }),
  },
  (t) => [
    index('hostel_allocations_tenant_id_room_id_idx').on(t.tenantId, t.roomId),
  ],
);

export const outpass = pgTable(
  'outpasses',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull(),
    reason: text('reason').notNull(),
    outAt: timestamp('out_at', { withTimezone: true, mode: 'date' }).notNull(),
    returnBy: timestamp('return_by', { withTimezone: true, mode: 'date' }).notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true, mode: 'date' }),
    parentApproval: E.approvalStatusEnum('parent_approval').default('pending').notNull(),
    wardenApproval: E.approvalStatusEnum('warden_approval').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const book = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    isbn: text('isbn'),
    title: text('title').notNull(),
    author: text('author'),
    publisher: text('publisher'),
    category: text('category'),
    rack: text('rack'),
  },
  (t) => [
    index('books_tenant_id_title_idx').on(t.tenantId, t.title),
  ],
);

export const bookCopy = pgTable(
  'book_copies',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    bookId: uuid('book_id').notNull().references(() => book.id, { onDelete: 'cascade' }),
    barcode: text('barcode').notNull(),  // raw
    status: text('status').default("available").notNull(),  // available | issued | lost | damaged
  },
  (t) => [
    unique('book_copies_tenant_id_barcode_key').on(t.tenantId, t.barcode),
  ],
);

export const bookIssue = pgTable(
  'book_issues',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    copyId: uuid('copy_id').notNull(),
    memberType: E.subjectTypeEnum('member_type').notNull(),
    memberId: uuid('member_id').notNull(),
    issuedOn: date('issued_on', { mode: 'string' }).notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    returnedOn: date('returned_on', { mode: 'string' }),
    finePaise: bigint('fine_paise', { mode: 'number' }).default(0).notNull(),
  },
  (t) => [
    index('book_issues_tenant_id_member_id_idx').on(t.tenantId, t.memberId),
  ],
);

export const inventoryItem = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    unit: text('unit').default("pcs").notNull(),
    sku: text('sku'),
    reorderLevel: doublePrecision('reorder_level').default(0).notNull(),
    stock: doublePrecision('stock').default(0).notNull(),
    isAsset: boolean('is_asset').default(false).notNull(),
  },
  (t) => [
    unique('inventory_items_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const supplier = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    gstin: text('gstin'),
    address: text('address'),
  },
);

export const stockMove = pgTable(
  'stock_moves',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    itemId: uuid('item_id').notNull(),
    kind: text('kind').notNull(),  // in | out | adjust
    qty: doublePrecision('qty').notNull(),
    ratePaise: bigint('rate_paise', { mode: 'number' }).default(0).notNull(),
    supplierId: uuid('supplier_id'),
    issuedTo: text('issued_to'),
    note: text('note'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('stock_moves_tenant_id_item_id_idx').on(t.tenantId, t.itemId),
  ],
);

export const healthRecord = pgTable(
  'health_records',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().unique(),
    heightCm: doublePrecision('height_cm'),
    weightKg: doublePrecision('weight_kg'),
    allergies: text('allergies'),
    conditions: text('conditions'),
    vaccinations: jsonb('vaccinations').$type<any>().default([]).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const infirmaryVisit = pgTable(
  'infirmary_visits',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull(),
    complaint: text('complaint').notNull(),
    treatment: text('treatment'),
    sentHome: boolean('sent_home').default(false).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const studentWallet = pgTable(
  'student_wallets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().unique(),
    balancePaise: bigint('balance_paise', { mode: 'number' }).default(0).notNull(),
    dailyLimitPaise: bigint('daily_limit_paise', { mode: 'number' }),
  },
);

export const canteenTxn = pgTable(
  'canteen_txns',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),  // + topup, - spend
    items: jsonb('items').$type<any>().default([]).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const incident = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    points: integer('points').default(0).notNull(),  // negative or positive
    description: text('description'),
    studentIds: text('student_ids').array().notNull(),
    reportedBy: text('reported_by'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const certificateTemplate = pgTable(
  'certificate_templates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),  // tc | character | bonafide | custom | id_card_student | id_card_staff
    name: text('name').notNull(),
    layout: jsonb('layout').$type<any>().notNull(),  // {size, background, fields:[{key,x,y,font,size}]}
  },
);

export const issuedCertificate = pgTable(
  'issued_certificates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    templateId: uuid('template_id').notNull(),
    ownerType: E.subjectTypeEnum('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    verifyCode: text('verify_code').notNull().unique(),  // raw
    data: jsonb('data').$type<any>().notNull(),
    fileId: uuid('file_id'),
    issuedBy: text('issued_by'),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
);

export const enquiry = pgTable(
  'enquiries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    forClass: text('for_class'),
    source: text('source'),
    note: text('note'),
    status: text('status').default("open").notNull(),
    followUpOn: date('follow_up_on', { mode: 'string' }),
    leadId: uuid('lead_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const visitor = pgTable(
  'visitors',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    purpose: text('purpose').notNull(),
    meetWith: text('meet_with'),
    photoFileId: uuid('photo_file_id'),
    inAt: timestamp('in_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    outAt: timestamp('out_at', { withTimezone: true, mode: 'date' }),
  },
);

export const callLog = pgTable(
  'call_logs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name'),
    phone: text('phone').notNull(),
    direction: E.directionEnum('direction').notNull(),
    note: text('note'),
    followUpOn: date('follow_up_on', { mode: 'string' }),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const postalRecord = pgTable(
  'postal_records',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    direction: E.directionEnum('direction').notNull(),
    party: text('party').notNull(),
    reference: text('reference'),
    note: text('note'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const complaint = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    raisedBy: text('raised_by'),  // user id
    name: text('name').notNull(),
    phone: text('phone'),
    category: text('category').notNull(),
    description: text('description').notNull(),
    status: text('status').default("open").notNull(),
    assignedTo: text('assigned_to'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true, mode: 'date' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const alumni = pgTable(
  'alumni',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id'),
    name: text('name').notNull(),
    batchYear: integer('batch_year').notNull(),
    phone: text('phone'),
    email: text('email'),
    occupation: text('occupation'),
    city: text('city'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);
