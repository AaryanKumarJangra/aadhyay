-- Row-Level Security for every tenant table (tenant_id NOT NULL).
-- aadhyay_apply_rls() is idempotent and is re-run by scripts/migrate.ts after every migration,
-- so new tenant tables are protected automatically.
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION aadhyay_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION aadhyay_apply_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.is_nullable = 'NO' AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = r.table_name AND policyname = 'tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = aadhyay_current_tenant()) WITH CHECK (tenant_id = aadhyay_current_tenant())', r.table_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aadhyay_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO aadhyay_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aadhyay_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aadhyay_app';
    -- Company-only tables are never readable by the tenant runtime role.
    EXECUTE 'REVOKE ALL ON platform_users, company_expenses, platform_leads FROM aadhyay_app';
  END IF;
END $$;--> statement-breakpoint
SELECT aadhyay_apply_rls();--> statement-breakpoint
-- Search helpers
CREATE INDEX IF NOT EXISTS students_name_trgm ON students USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tenants_name_trgm ON tenants USING gin (name gin_trgm_ops);
