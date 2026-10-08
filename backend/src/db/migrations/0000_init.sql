CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_mode" AS ENUM('manual', 'qr', 'rfid', 'face', 'biometric', 'geo', 'live');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'half_day', 'leave', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('push', 'inbox', 'messenger', 'whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('direct', 'group', 'broadcast', 'institution');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('unpaid', 'partial', 'paid', 'waived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('proforma', 'tax', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'partially_paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_kind" AS ENUM('staff', 'student', 'guardian', 'alumni');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pay_mode" AS ENUM('cash', 'upi', 'card', 'netbanking', 'cheque', 'dd', 'bank_transfer', 'wallet', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'inactive', 'left', 'alumni');--> statement-breakpoint
CREATE TYPE "public"."scope_kind" AS ENUM('tenant', 'branch', 'class', 'section', 'own');--> statement-breakpoint
CREATE TYPE "public"."segment" AS ENUM('school', 'college', 'institute', 'coaching', 'creator');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('student', 'staff');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('trial', 'active', 'grace', 'suspended', 'archived', 'purged');--> statement-breakpoint
CREATE TYPE "public"."trip_direction" AS ENUM('pickup', 'drop');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('scheduled', 'running', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."wa_category" AS ENUM('marketing', 'utility', 'authentication', 'service');--> statement-breakpoint
CREATE TYPE "public"."wallet_txn_kind" AS ENUM('topup', 'debit', 'refund', 'adjustment', 'credit');--> statement-breakpoint
CREATE TABLE "attendance_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"serial" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_devices_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"section_id" uuid,
	"date" date NOT NULL,
	"period_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"status" "attendance_status" NOT NULL,
	"mode" "attendance_mode" DEFAULT 'manual' NOT NULL,
	"device_id" uuid,
	"in_at" timestamp with time zone,
	"out_at" timestamp with time zone,
	"marked_by" text,
	"source_ts" timestamp with time zone,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_tenant_id_subject_type_subject_id_date_period_id_key" UNIQUE("tenant_id","subject_type","subject_id","date","period_id")
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"file_id" uuid,
	"url" text,
	"body" text,
	"drm" boolean DEFAULT false NOT NULL,
	"release_at" timestamp with time zone,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"progress" double precision DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_progress_content_id_student_id_key" UNIQUE("content_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_file_id" uuid,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_tenant_id_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"term" text,
	"weightage" double precision DEFAULT 100 NOT NULL,
	"grade_scale_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date,
	"start_time" text,
	"end_time" text,
	"room" text,
	"max_marks" double precision NOT NULL,
	"pass_marks" double precision NOT NULL,
	CONSTRAINT "exam_schedules_exam_id_class_id_subject_id_key" UNIQUE("exam_id","class_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bands" jsonb NOT NULL,
	CONSTRAINT "grade_scales_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"attachments" text[] NOT NULL,
	"assigned_on" date NOT NULL,
	"due_on" date NOT NULL,
	"max_marks" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"files" text[] NOT NULL,
	"text" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"marks" double precision,
	"feedback" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone,
	CONSTRAINT "homework_submissions_homework_id_student_id_key" UNIQUE("homework_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"applied_by" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"leave_type_id" uuid,
	"reason" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" text NOT NULL,
	"join_url" text,
	"room" text,
	"audience" jsonb NOT NULL,
	"host_staff_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"recording_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mark_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks" double precision,
	"grade" text,
	"is_absent" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"entered_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mark_entries_schedule_id_student_id_key" UNIQUE("schedule_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "online_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"audience" jsonb NOT NULL,
	"question_ids" text[] NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_min" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"shuffle" boolean DEFAULT true NOT NULL,
	"proctoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_test_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" double precision,
	"rank" integer,
	"percentile" double precision,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "online_test_attempts_test_id_student_id_key" UNIQUE("test_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" jsonb NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"marks" double precision DEFAULT 1 NOT NULL,
	"negative" double precision DEFAULT 0 NOT NULL,
	"difficulty" text,
	"tags" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject_id" uuid
);
--> statement-breakpoint
CREATE TABLE "report_card_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'general' NOT NULL,
	"layout" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"total_marks" double precision NOT NULL,
	"max_marks" double precision NOT NULL,
	"percentage" double precision NOT NULL,
	"grade" text,
	"rank" integer,
	"is_pass" boolean NOT NULL,
	"remarks" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "results_exam_id_student_id_key" UNIQUE("exam_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"name" text NOT NULL,
	"section_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"planned_on" date,
	"completed_on" date,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_flavours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"app_name" text NOT NULL,
	"android_package" text NOT NULL,
	"ios_bundle_id" uuid,
	"sha256" text[] NOT NULL,
	"colors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"build_status" text DEFAULT 'not_built' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_flavours_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "app_flavours_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "break_glass_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"category" text NOT NULL,
	"vendor" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"gst_paise" bigint DEFAULT 0 NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" "invoice_kind" DEFAULT 'tax' NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"place_of_supply" text NOT NULL,
	"subtotal_paise" bigint NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_file_id" uuid,
	"ref_invoice_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"sac" text DEFAULT '998314' NOT NULL,
	"qty" double precision NOT NULL,
	"unit_paise" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"price_code" text
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment" "segment",
	"price_per_unit_paise" bigint NOT NULL,
	"pricing_unit" text DEFAULT 'student' NOT NULL,
	"min_monthly_paise" bigint NOT NULL,
	"range_min_paise" bigint NOT NULL,
	"range_max_paise" bigint NOT NULL,
	"learner_limit" integer,
	"included_modules" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"institution" text,
	"city" text,
	"students" integer,
	"source" text DEFAULT 'website' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"purpose" text DEFAULT 'invoice' NOT NULL,
	"gateway" text NOT NULL,
	"gateway_ref" text,
	"amount_paise" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"totp_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "price_book_items" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"list_paise" bigint NOT NULL,
	"min_paise" bigint NOT NULL,
	"max_paise" bigint NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"cycle" "billing_cycle" DEFAULT 'yearly' NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"discount_pct" double precision DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"price_code" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_paise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"opened_by" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"sla_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"segment" "segment" DEFAULT 'school' NOT NULL,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"plan_code" text DEFAULT 'enterprise' NOT NULL,
	"city" text,
	"state" text,
	"state_code" text,
	"gstin" text,
	"billing_email" text,
	"billing_phone" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"db_url" text,
	"trial_ends_at" timestamp with time zone,
	"period_ends_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"purge_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" text NOT NULL,
	"kind" text DEFAULT 'subdomain' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verify_token" text,
	"verified_at" timestamp with time zone,
	"cf_hostname_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_host_unique" UNIQUE("host")
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'plan' NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_modules_tenant_id_module_key_key" UNIQUE("tenant_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meter" text NOT NULL,
	"qty" double precision NOT NULL,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"ref" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL,
	"low_alert_paise" bigint DEFAULT 20000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_txns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wallet_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "wallet_txn_kind" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"ref" text,
	"usage_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"tenant_id" uuid,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"course_name" text,
	"centre" text,
	"starts_on" date,
	"ends_on" date,
	"fee_paise" bigint DEFAULT 0 NOT NULL,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "batch_students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"joined_on" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_students_batch_id_student_id_key" UNIQUE("batch_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"started_by" text NOT NULL,
	"sfu_room" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" "channel" NOT NULL,
	"audience" jsonb NOT NULL,
	"template_ref" text,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_hashes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"phone_hash" text NOT NULL,
	"label" text,
	CONSTRAINT "contact_hashes_owner_user_id_phone_hash_key" UNIQUE("owner_user_id","phone_hash")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"tenant_id" uuid,
	"title" text,
	"avatar_file_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid,
	"pending_phone_hash" text,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_key" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"percent" double precision,
	"amount_paise" bigint,
	"max_uses" integer,
	"used" integer DEFAULT 0 NOT NULL,
	"valid_till" timestamp with time zone,
	CONSTRAINT "coupons_tenant_id_code_key" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "credit_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"semester" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	"credits" double precision NOT NULL,
	"grade_point" double precision NOT NULL,
	"is_backlog" boolean DEFAULT false NOT NULL,
	CONSTRAINT "credit_results_student_id_semester_subject_id_key" UNIQUE("student_id","semester","subject_id")
);
--> statement-breakpoint
CREATE TABLE "dpdp_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"for_class" text,
	"source" text DEFAULT 'walk_in' NOT NULL,
	"stage_id" uuid,
	"score" integer DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"student_id" uuid,
	"lost_reason" text,
	"next_follow_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_tenant_id_phone_key" UNIQUE("tenant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"by_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_blobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"pending_downloads" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_blobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "message_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	CONSTRAINT "message_receipts_message_id_user_id_key" UNIQUE("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messenger_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"registration_id" integer NOT NULL,
	"identity_key" text NOT NULL,
	"signing_key" text NOT NULL,
	"signed_pre_key_id" integer NOT NULL,
	"signed_pre_key" text NOT NULL,
	"signed_pre_key_sig" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "messenger_devices_user_id_device_id_key" UNIQUE("user_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "messenger_envelopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"sender_device_id" text NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"recipient_device_id" text NOT NULL,
	"type" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messenger_prekeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_ref" uuid NOT NULL,
	"key_id" integer NOT NULL,
	"public_key" text NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "messenger_prekeys_device_ref_key_id_key" UNIQUE("device_ref","key_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"buyer_user_id" uuid,
	"buyer_phone" text NOT NULL,
	"buyer_name" text NOT NULL,
	"course_id" uuid NOT NULL,
	"coupon_code" text,
	"amount_paise" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"gateway_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"phone_hash" text NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_at" timestamp with time zone,
	CONSTRAINT "pending_invites_sender_user_id_phone_hash_key" UNIQUE("sender_user_id","phone_hash")
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement_drives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"ctc_paise" bigint,
	"eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"semesters" integer NOT NULL,
	"credits_required" integer,
	CONSTRAINT "programmes_tenant_id_code_key" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "site_forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"to_crm" boolean DEFAULT true NOT NULL,
	CONSTRAINT "site_forms_tenant_id_key_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "site_menus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "site_menus_tenant_id_key_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_tenant_id_slug_locale_key" UNIQUE("tenant_id","slug","locale")
);
--> statement-breakpoint
CREATE TABLE "site_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text DEFAULT 'news' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text,
	"cover_file_id" uuid,
	"images" text[] NOT NULL,
	"event_start" timestamp with time zone,
	"event_end" timestamp with time zone,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_posts_tenant_id_kind_slug_key" UNIQUE("tenant_id","kind","slug")
);
--> statement-breakpoint
CREATE TABLE "site_redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"code" integer DEFAULT 301 NOT NULL,
	CONSTRAINT "site_redirects_tenant_id_from_path_key" UNIQUE("tenant_id","from_path")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_user_id_blocked_user_id_key" UNIQUE("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "wa_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text NOT NULL,
	"verified_name" text,
	"token_enc" text NOT NULL,
	"quality" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_accounts_phone_number_id_unique" UNIQUE("phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_name" text,
	"last_inbound_at" timestamp with time zone,
	"assigned_to" text,
	"lead_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_conversations_account_id_contact_phone_key" UNIQUE("account_id","contact_phone")
);
--> statement-breakpoint
CREATE TABLE "wa_flows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"categories" text[] NOT NULL,
	"flow_json" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"meta_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"type" text NOT NULL,
	"body" jsonb NOT NULL,
	"meta_message_id" text,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"category" "wa_category",
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_messages_meta_message_id_unique" UNIQUE("meta_message_id")
);
--> statement-breakpoint
CREATE TABLE "wa_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"category" "wa_category" NOT NULL,
	"components" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"meta_id" text,
	"reject_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_templates_tenant_id_name_language_key" UNIQUE("tenant_id","name","language")
);
--> statement-breakpoint
CREATE TABLE "fee_discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"percent" double precision,
	"amount_paise" bigint,
	"requires_approval" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"is_transport" boolean DEFAULT false NOT NULL,
	"ledger_account_id" uuid,
	CONSTRAINT "fee_heads_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid,
	"category" text,
	"name" text NOT NULL,
	"late_fee_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structure_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"head_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"installment_no" integer DEFAULT 1 NOT NULL,
	"due_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"head" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"date" date NOT NULL,
	"mode" "pay_mode" DEFAULT 'cash' NOT NULL,
	"voucher_no" text,
	"party" text,
	"note" text,
	"file_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"narration" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_paise" bigint DEFAULT 0 NOT NULL,
	"credit_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"allotted" double precision NOT NULL,
	"used" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "leave_balances_staff_id_leave_type_id_year_key" UNIQUE("staff_id","leave_type_id","year")
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"days_per_year" double precision NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	CONSTRAINT "leave_types_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ledger_accounts_tenant_id_code_key" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"prefix" text NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "number_series_tenant_id_key_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_ids" text[] NOT NULL,
	"amount_paise" bigint NOT NULL,
	"gateway" text NOT NULL,
	"gateway_order_id" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"receipt_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_tenant_id_month_key" UNIQUE("tenant_id","month")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"working_days" double precision NOT NULL,
	"paid_days" double precision NOT NULL,
	"gross_paise" bigint NOT NULL,
	"deductions" jsonb NOT NULL,
	"earnings" jsonb NOT NULL,
	"net_paise" bigint NOT NULL,
	CONSTRAINT "payslips_run_id_staff_id_key" UNIQUE("run_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"total_paise" bigint NOT NULL,
	"mode" "pay_mode" NOT NULL,
	"reference" text,
	"gateway_ref" text,
	"collected_by" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "receipts_tenant_id_number_key" UNIQUE("tenant_id","number")
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"student_fee_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"late_fee_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"basic_paise" bigint NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pf_enabled" boolean DEFAULT true NOT NULL,
	"esi_enabled" boolean DEFAULT false NOT NULL,
	"pt_state" text,
	"tds_monthly_paise" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structures_staff_id_unique" UNIQUE("staff_id")
);
--> statement-breakpoint
CREATE TABLE "student_fees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"structure_item_id" uuid,
	"head_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"late_fee_paise" bigint DEFAULT 0 NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"status" "fee_status" DEFAULT 'unpaid' NOT NULL,
	"due_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"prev_hash" text,
	"hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comm_routing_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"channels" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comm_routing_rules_tenant_id_event_key_key" UNIQUE("tenant_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"subject_id" uuid,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text,
	"owner_user_id" uuid,
	"purpose" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "membership_kind" NOT NULL,
	"person_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_id_user_id_kind_key" UNIQUE("tenant_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid,
	"user_id" uuid,
	"to_address" text,
	"channel" "channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_ref" text,
	"error" text,
	"cost_paise" bigint DEFAULT 0 NOT NULL,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb NOT NULL,
	"attachments" text[] NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"student_id" uuid,
	"event_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"channel" "channel" NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"wa_template_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_tenant_id_event_key_channel_locale_key" UNIQUE("tenant_id","event_key","channel","locale")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_user_id" uuid,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"app_id" text DEFAULT 'aadhyay' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_tenant_id_key_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_kind" "scope_kind" DEFAULT 'tenant' NOT NULL,
	"scope_id" uuid,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"platform" text,
	"refresh_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"tenant_id" uuid,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"phone_hash" text,
	"email" text,
	"name" text NOT NULL,
	"password_hash" text,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"avatar_file_id" uuid,
	"last_active_at" timestamp with time zone,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sessions_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"city" text,
	"phone" text,
	"lat" double precision,
	"lng" double precision,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_tenant_id_code_key" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"applies_to" jsonb DEFAULT '{"all":true}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid,
	CONSTRAINT "class_subjects_tenant_id_class_id_section_id_subject_id_key" UNIQUE("tenant_id","class_id","section_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "custom_field_defs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" text[] NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "custom_field_defs_tenant_id_entity_key_key" UNIQUE("tenant_id","entity","key")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "departments_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "designations_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"roll_no" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_tenant_id_student_id_session_id_key" UNIQUE("tenant_id","student_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"occupation" text,
	"address" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_tenant_id_phone_key" UNIQUE("tenant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "periods_tenant_id_order_key" UNIQUE("tenant_id","order")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_teacher_id" uuid,
	"capacity" integer,
	CONSTRAINT "sections_tenant_id_class_id_name_key" UNIQUE("tenant_id","class_id","name")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"employee_code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"gender" "gender",
	"dob" date,
	"department_id" uuid,
	"designation_id" uuid,
	"joining_date" date,
	"qualification" text,
	"address" text,
	"bank_account" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_file_id" uuid,
	"rfid_uid" text,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "staff_tenant_id_employee_code_key" UNIQUE("tenant_id","employee_code")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"admission_no" text NOT NULL,
	"name" text NOT NULL,
	"dob" date,
	"gender" "gender",
	"category" text,
	"house" text,
	"blood_group" text,
	"religion" text,
	"address" text,
	"apaar_id" text,
	"rte" boolean DEFAULT false NOT NULL,
	"phone" text,
	"email" text,
	"photo_file_id" uuid,
	"qr_code" text,
	"rfid_uid" text,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"admitted_on" date,
	"left_on" date,
	"left_reason" text,
	"user_id" uuid,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "students_tenant_id_admission_no_key" UNIQUE("tenant_id","admission_no")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"receives_notifications" boolean DEFAULT true NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_key" UNIQUE("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"type" text DEFAULT 'theory' NOT NULL,
	CONSTRAINT "subjects_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "substitutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot_id" uuid NOT NULL,
	"absent_teacher_id" uuid NOT NULL,
	"substitute_teacher_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"period_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid,
	"room" text,
	CONSTRAINT "timetable_slots_tenant_id_section_id_weekday_period_id_key" UNIQUE("tenant_id","section_id","weekday","period_id")
);
--> statement-breakpoint
CREATE TABLE "alumni" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid,
	"name" text NOT NULL,
	"batch_year" integer NOT NULL,
	"phone" text,
	"email" text,
	"occupation" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"author" text,
	"publisher" text,
	"category" text,
	"rack" text
);
--> statement-breakpoint
CREATE TABLE "book_copies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	CONSTRAINT "book_copies_tenant_id_barcode_key" UNIQUE("tenant_id","barcode")
);
--> statement-breakpoint
CREATE TABLE "book_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"copy_id" uuid NOT NULL,
	"member_type" "subject_type" NOT NULL,
	"member_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"returned_on" date,
	"fine_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text,
	"phone" text NOT NULL,
	"direction" "direction" NOT NULL,
	"note" text,
	"follow_up_on" date,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_txns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"raised_by" text,
	"name" text NOT NULL,
	"phone" text,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"sla_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"for_class" text,
	"source" text,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"follow_up_on" date,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"height_cm" double precision,
	"weight_kg" double precision,
	"allergies" text,
	"conditions" text,
	"vaccinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_records_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'boys' NOT NULL,
	"warden_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "hostel_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"bed_no" integer,
	"from_date" date NOT NULL,
	"to_date" date
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostel_id" uuid NOT NULL,
	"number" text NOT NULL,
	"room_type" text DEFAULT 'standard' NOT NULL,
	"beds" integer NOT NULL,
	"fee_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "hostel_rooms_hostel_id_number_key" UNIQUE("hostel_id","number")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"description" text,
	"student_ids" text[] NOT NULL,
	"reported_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infirmary_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"complaint" text NOT NULL,
	"treatment" text,
	"sent_home" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"sku" text,
	"reorder_level" double precision DEFAULT 0 NOT NULL,
	"stock" double precision DEFAULT 0 NOT NULL,
	"is_asset" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inventory_items_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "issued_certificates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"owner_type" "subject_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"verify_code" text NOT NULL,
	"data" jsonb NOT NULL,
	"file_id" uuid,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "issued_certificates_verify_code_unique" UNIQUE("verify_code")
);
--> statement-breakpoint
CREATE TABLE "location_pings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed" double precision,
	"heading" double precision,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outpasses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"out_at" timestamp with time zone NOT NULL,
	"return_by" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"parent_approval" "approval_status" DEFAULT 'pending' NOT NULL,
	"warden_approval" "approval_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postal_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"party" text NOT NULL,
	"reference" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routes_tenant_id_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" double precision NOT NULL,
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"issued_to" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"order" integer NOT NULL,
	"pickup_time" text,
	"drop_time" text,
	"fee_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_transports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"route_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "student_transports_student_id_direction_key" UNIQUE("student_id","direction")
);
--> statement-breakpoint
CREATE TABLE "student_wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL,
	"daily_limit_paise" bigint,
	CONSTRAINT "student_wallets_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"gstin" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "tracking_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"student_ids" text[] NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "tracking_links_trip_id_guardian_id_key" UNIQUE("trip_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"driver_user_id" uuid,
	"status" "trip_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"distance_m" double precision DEFAULT 0 NOT NULL,
	"last_lat" double precision,
	"last_lng" double precision,
	"last_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trip_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"student_id" uuid,
	"stop_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reg_no" text NOT NULL,
	"name" text,
	"capacity" integer NOT NULL,
	"gps_device_id" text,
	"driver_staff_id" uuid,
	"attendant_staff_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_tenant_id_reg_no_key" UNIQUE("tenant_id","reg_no")
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"purpose" text NOT NULL,
	"meet_with" text,
	"photo_file_id" uuid,
	"in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"out_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_module_id_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_group_id_exam_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."exam_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_schedule_id_exam_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_test_attempts" ADD CONSTRAINT "online_test_attempts_test_id_online_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."online_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_txns" ADD CONSTRAINT "wallet_txns_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_prekeys" ADD CONSTRAINT "messenger_prekeys_device_ref_messenger_devices_id_fk" FOREIGN KEY ("device_ref") REFERENCES "public"."messenger_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_structure_id_fee_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transports" ADD CONSTRAINT "student_transports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_records_tenant_id_date_section_id_idx" ON "attendance_records" USING btree ("tenant_id","date","section_id");--> statement-breakpoint
CREATE INDEX "diary_entries_tenant_id_section_id_date_idx" ON "diary_entries" USING btree ("tenant_id","section_id","date");--> statement-breakpoint
CREATE INDEX "homework_tenant_id_section_id_due_on_idx" ON "homework" USING btree ("tenant_id","section_id","due_on");--> statement-breakpoint
CREATE INDEX "leave_requests_tenant_id_status_idx" ON "leave_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "live_attendance_tenant_id_session_id_idx" ON "live_attendance" USING btree ("tenant_id","session_id");--> statement-breakpoint
CREATE INDEX "company_expenses_month_idx" ON "company_expenses" USING btree ("month");--> statement-breakpoint
CREATE INDEX "invoices_tenant_id_issued_at_idx" ON "invoices" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "platform_payments_tenant_id_idx" ON "platform_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_id_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "usage_records_tenant_id_meter_occurred_at_idx" ON "usage_records" USING btree ("tenant_id","meter","occurred_at");--> statement-breakpoint
CREATE INDEX "wallet_txns_tenant_id_created_at_idx" ON "wallet_txns" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_tenant_id_idx" ON "conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_members_pending_phone_hash_idx" ON "conversation_members" USING btree ("pending_phone_hash");--> statement-breakpoint
CREATE INDEX "leads_tenant_id_stage_id_idx" ON "leads" USING btree ("tenant_id","stage_id");--> statement-breakpoint
CREATE INDEX "messenger_envelopes_recipient_user_id_recipient_device_id_sent_at_idx" ON "messenger_envelopes" USING btree ("recipient_user_id","recipient_device_id","sent_at");--> statement-breakpoint
CREATE INDEX "messenger_prekeys_device_ref_used_at_idx" ON "messenger_prekeys" USING btree ("device_ref","used_at");--> statement-breakpoint
CREATE INDEX "pending_invites_phone_hash_idx" ON "pending_invites" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "wa_messages_tenant_id_created_at_idx" ON "wa_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "income_expenses_tenant_id_kind_date_idx" ON "income_expenses" USING btree ("tenant_id","kind","date");--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_id_date_idx" ON "journal_entries" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "payment_intents_gateway_order_id_idx" ON "payment_intents" USING btree ("gateway_order_id");--> statement-breakpoint
CREATE INDEX "receipts_tenant_id_student_id_idx" ON "receipts" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "student_fees_tenant_id_student_id_status_idx" ON "student_fees" USING btree ("tenant_id","student_id","status");--> statement-breakpoint
CREATE INDEX "student_fees_tenant_id_due_on_status_idx" ON "student_fees" USING btree ("tenant_id","due_on","status");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_id_at_idx" ON "audit_logs" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_id_entity_entity_id_idx" ON "audit_logs" USING btree ("tenant_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "consent_records_tenant_id_subject_id_idx" ON "consent_records" USING btree ("tenant_id","subject_id");--> statement-breakpoint
CREATE INDEX "files_tenant_id_purpose_idx" ON "files" USING btree ("tenant_id","purpose");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_deliveries_tenant_id_created_at_idx" ON "message_deliveries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "message_deliveries_provider_ref_idx" ON "message_deliveries" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "notices_tenant_id_publish_at_idx" ON "notices" USING btree ("tenant_id","publish_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_id_user_id_created_at_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_assignments_tenant_id_membership_id_idx" ON "role_assignments" USING btree ("tenant_id","membership_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_events_tenant_id_starts_on_idx" ON "calendar_events" USING btree ("tenant_id","starts_on");--> statement-breakpoint
CREATE INDEX "documents_tenant_id_owner_type_owner_id_idx" ON "documents" USING btree ("tenant_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "enrollments_tenant_id_section_id_idx" ON "enrollments" USING btree ("tenant_id","section_id");--> statement-breakpoint
CREATE INDEX "students_tenant_id_name_idx" ON "students" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "student_guardians_tenant_id_guardian_id_idx" ON "student_guardians" USING btree ("tenant_id","guardian_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_tenant_id_teacher_id_weekday_idx" ON "timetable_slots" USING btree ("tenant_id","teacher_id","weekday");--> statement-breakpoint
CREATE INDEX "books_tenant_id_title_idx" ON "books" USING btree ("tenant_id","title");--> statement-breakpoint
CREATE INDEX "book_issues_tenant_id_member_id_idx" ON "book_issues" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "hostel_allocations_tenant_id_room_id_idx" ON "hostel_allocations" USING btree ("tenant_id","room_id");--> statement-breakpoint
CREATE INDEX "location_pings_trip_id_at_idx" ON "location_pings" USING btree ("trip_id","at");--> statement-breakpoint
CREATE INDEX "stock_moves_tenant_id_item_id_idx" ON "stock_moves" USING btree ("tenant_id","item_id");--> statement-breakpoint
CREATE INDEX "student_transports_tenant_id_vehicle_id_direction_idx" ON "student_transports" USING btree ("tenant_id","vehicle_id","direction");--> statement-breakpoint
CREATE INDEX "trips_tenant_id_vehicle_id_started_at_idx" ON "trips" USING btree ("tenant_id","vehicle_id","started_at");--> statement-breakpoint
CREATE INDEX "trip_events_tenant_id_trip_id_idx" ON "trip_events" USING btree ("tenant_id","trip_id");