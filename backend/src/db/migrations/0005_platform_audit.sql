-- Platform audit trail (control plane actions: onboarding, lifecycle, modules, pricing, wallet). Never readable by the
-- tenant runtime role: aadhyay_apply_rls() now revokes it alongside the other company-only tables.
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"target_tenant" uuid,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "platform_audit_logs_target_at_idx" ON "platform_audit_logs" USING btree ("target_tenant","at");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_at_idx" ON "platform_audit_logs" USING btree ("at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION aadhyay_apply_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.is_nullable FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    IF r.is_nullable = 'NO' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = r.table_name AND policyname = 'tenant_isolation') THEN
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = aadhyay_current_tenant()) WITH CHECK (tenant_id = aadhyay_current_tenant())', r.table_name);
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = r.table_name AND policyname = 'tenant_or_global') THEN
        EXECUTE format('CREATE POLICY tenant_or_global ON %I USING (tenant_id IS NULL OR tenant_id = aadhyay_current_tenant()) WITH CHECK (tenant_id IS NULL OR tenant_id = aadhyay_current_tenant())', r.table_name);
      END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aadhyay_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO aadhyay_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aadhyay_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aadhyay_app';
    -- Company-only tables and integration credentials are never reachable from the tenant runtime role.
    EXECUTE 'REVOKE ALL ON platform_users, company_expenses, platform_leads, wa_accounts, platform_audit_logs FROM aadhyay_app';
  END IF;
END $$;--> statement-breakpoint
SELECT aadhyay_apply_rls();
