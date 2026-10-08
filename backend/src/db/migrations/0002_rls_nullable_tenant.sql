-- Tables whose tenant_id is NULLABLE (rows can be global/platform-owned) were skipped by aadhyay_apply_rls(),
-- so the RLS-enforced runtime role could read every tenant's rows. They now get a policy that allows only
-- global rows (tenant_id IS NULL) or the current tenant's rows. Re-run on every migrate (see scripts/migrate.ts).
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
    EXECUTE 'REVOKE ALL ON platform_users, company_expenses, platform_leads, wa_accounts FROM aadhyay_app';
  END IF;
END $$;--> statement-breakpoint
SELECT aadhyay_apply_rls();
