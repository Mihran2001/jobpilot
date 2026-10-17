-- Index experiment for application_events.application_id.
-- Everything runs in one transaction that ends in ROLLBACK, so nothing is kept.
--   docker compose exec -T postgres psql -U jobpilot -d jobpilot < packages/db/explain/application-events.sql

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- 1. Realistic volume: 20,000 applications with 10 events each = 200,000 events.
--    An application needs a listing (unique per user + listing), so make listings first.
INSERT INTO job_listings (id, source_id, external_id, company_id, title, description, url, location, remote, posted_at)
SELECT gen_random_uuid(),
       (SELECT id FROM sources ORDER BY name LIMIT 1),
       'events-exp-' || g,
       (SELECT id FROM companies ORDER BY name LIMIT 1),
       'Listing ' || g, 'x', 'https://example.com/' || g, 'Remote', true, now()
FROM generate_series(1, 20000) AS g;

INSERT INTO applications (id, user_id, job_listing_id, status)
SELECT gen_random_uuid(), (SELECT id FROM users WHERE email = 'dev@jobpilot.test'), id, 'SAVED'
FROM job_listings WHERE external_id LIKE 'events-exp-%';

-- CROSS JOIN with 1..10 gives every application 10 rows.
INSERT INTO application_events (id, application_id, from_status, to_status, created_at)
SELECT gen_random_uuid(), a.id, 'SAVED', 'APPLIED', now() - (n || ' days')::interval
FROM applications a CROSS JOIN generate_series(1, 10) AS n;

-- 2. Update the planner's statistics, or it still thinks the table is tiny.
ANALYZE application_events;
ANALYZE applications;

-- 3. Pick one application to query. \gset stores the result in the psql variable app_id.
SELECT id AS app_id FROM applications ORDER BY id LIMIT 1 OFFSET 5000 \gset

\echo '=== BEFORE: application detail query'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, from_status, to_status, note, created_at
FROM application_events WHERE application_id = :'app_id' ORDER BY created_at;

\echo '=== BEFORE: deleting an application (cascades to its events)'
EXPLAIN (ANALYZE, COSTS OFF) DELETE FROM applications WHERE id = :'app_id';

-- 4. The index. Pick a different application, because we just deleted the first one.
SELECT id AS app_id FROM applications ORDER BY id LIMIT 1 OFFSET 6000 \gset
CREATE INDEX application_events_application_id_created_at_idx
  ON application_events (application_id, created_at);

\echo '=== AFTER: application detail query'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, from_status, to_status, note, created_at
FROM application_events WHERE application_id = :'app_id' ORDER BY created_at;

\echo '=== AFTER: deleting an application'
EXPLAIN (ANALYZE, COSTS OFF) DELETE FROM applications WHERE id = :'app_id';

ROLLBACK;