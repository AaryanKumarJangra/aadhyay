-- Runs once on a fresh database. App connects as aadhyay_app (RLS enforced, no BYPASSRLS).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aadhyay_app') THEN
    CREATE ROLE aadhyay_app LOGIN PASSWORD 'aadhyay_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT CONNECT ON DATABASE aadhyay TO aadhyay_app;
