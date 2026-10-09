-- Authorization v2 (docs/redesign/03-AUTHORIZATION.md): per-permission scope and conditions on roles,
-- and template versioning so untouched system roles can be upgraded.
ALTER TABLE "roles" ADD COLUMN "scopes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "conditions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "template_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Roles edited after creation are treated as customised (never auto-upgraded).
UPDATE "roles" SET "is_customized" = true WHERE "is_system" = true AND "updated_at" > "created_at" + interval '1 second';--> statement-breakpoint
-- Custom fields used the settings permission prefix; they now have their own catalogue resource.
UPDATE "roles" SET "permissions" = array_replace("permissions", 'org.settings.create', 'org.customfield.create');
