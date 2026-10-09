-- CMS v2: drafts are stored apart from live content (saving never changes the public site), a review workflow,
-- and media metadata (alt text, caption, folder) for the media library.
ALTER TABLE "site_pages" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "site_pages" ADD COLUMN "review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_pages" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "site_pages" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "site_pages" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;
