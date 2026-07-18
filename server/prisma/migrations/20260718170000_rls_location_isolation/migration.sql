-- Row-Level Security for location isolation (spec §16: "Use PostgreSQL with
-- row-level security to enforce data isolation between pharmacy locations").
--
-- This is defense-in-depth BENEATH the API-layer isolation already enforced by
-- assertLocationAccess()/resolveLocationScope(). It guarantees that even a query
-- that forgot to scope itself cannot cross a location boundary at the DB level.
--
-- Enforcement model (GUC contract):
--   * The application connects as the least-privilege role `pharmacy_app`
--     (NOSUPERUSER, NOBYPASSRLS) so policies actually apply.
--   * Per request the app sets two transaction-local GUCs:
--       SET LOCAL app.is_owner   = 'on'                  -- SYSTEM_OWNER: unrestricted
--       SET LOCAL app.pharmacy_id = '<the user's pharmacyId>'
--     e.g. via: SELECT set_config('app.pharmacy_id', $1, true);
--   * With neither GUC set, the policies fail CLOSED (no rows) for pharmacy_app,
--     so a missing context can never leak data.
--   * The superuser used for migrations/seed bypasses RLS, so those keep working.

-- ---------------------------------------------------------------------------
-- Least-privilege application role.
-- NOTE: dev password below — rotate (ALTER ROLE ... PASSWORD) before production.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacy_app') THEN
    CREATE ROLE pharmacy_app LOGIN PASSWORD 'pharmacy_app_dev_pw'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO pharmacy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pharmacy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pharmacy_app;
-- Tables/sequences created by future migrations (owned by the migrator) too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharmacy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pharmacy_app;

-- ---------------------------------------------------------------------------
-- Policies. FORCE so they apply even to the table owner (belt & suspenders).
-- ---------------------------------------------------------------------------

-- Patient: direct pharmacyId match.
ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Patient" FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_location_isolation ON "Patient"
  USING (
    current_setting('app.is_owner', true) = 'on'
    OR "pharmacyId" = current_setting('app.pharmacy_id', true)
  )
  WITH CHECK (
    current_setting('app.is_owner', true) = 'on'
    OR "pharmacyId" = current_setting('app.pharmacy_id', true)
  );

-- Allergy: inherits its parent patient's pharmacy.
ALTER TABLE "Allergy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Allergy" FORCE ROW LEVEL SECURITY;
CREATE POLICY allergy_location_isolation ON "Allergy"
  USING (
    current_setting('app.is_owner', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "Allergy"."patientId"
        AND p."pharmacyId" = current_setting('app.pharmacy_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.is_owner', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "Allergy"."patientId"
        AND p."pharmacyId" = current_setting('app.pharmacy_id', true)
    )
  );

-- ChronicCondition: inherits its parent patient's pharmacy.
ALTER TABLE "ChronicCondition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChronicCondition" FORCE ROW LEVEL SECURITY;
CREATE POLICY condition_location_isolation ON "ChronicCondition"
  USING (
    current_setting('app.is_owner', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "ChronicCondition"."patientId"
        AND p."pharmacyId" = current_setting('app.pharmacy_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.is_owner', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "ChronicCondition"."patientId"
        AND p."pharmacyId" = current_setting('app.pharmacy_id', true)
    )
  );
