CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"actor_id" uuid,
	"ip" text,
	"user_agent" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_events_subject_at_idx" ON "security_events" USING btree ("subject","at");--> statement-breakpoint
CREATE INDEX "security_events_kind_at_idx" ON "security_events" USING btree ("kind","at");