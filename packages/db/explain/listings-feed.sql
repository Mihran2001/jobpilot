-- Index experiment for the listings feed (GET /api/listings).
--
-- Runs entirely inside one transaction that ends in ROLLBACK: the 100k test
-- rows and the index disappear afterwards. Run from the repo root:
--
--   docker compose exec -T postgres psql -U jobpilot -d jobpilot < packages/db/explain/listings-feed.sql
--
-- The queries mirror what Prisma sends (captured with Prisma's query log),
-- with the parameters filled in.

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

\echo '== Inserting 100,000 listings spread over two years'
INSERT INTO job_listings
  (id, source_id, external_id, company_id, title, description, url, location,
   remote, salary_max, posted_at)
SELECT
  gen_random_uuid(),
  (SELECT id FROM sources ORDER BY name LIMIT 1),
  'bulk-' || g,
  (SELECT id FROM companies ORDER BY name LIMIT 1),
  'Bulk listing ' || g,
  'Generated for the index experiment.',
  'https://example.com/bulk/' || g,
  'Remote',
  g % 3 <> 0,
  40000 + (g % 80) * 1000,
  now() - (random() * interval '730 days')
FROM generate_series(1, 100000) AS g;

-- Fresh statistics, otherwise the planner still thinks the table has 8 rows.
ANALYZE job_listings;

-- A cursor halfway down the feed: what page ~2,500 at 20 per page would use.
SELECT posted_at AS cur_posted_at, id AS cur_id
FROM job_listings ORDER BY posted_at DESC, id DESC OFFSET 50000 LIMIT 1 \gset

\echo ''
\echo '================ BEFORE: no index on (posted_at, id) ================'
\echo '-- First page'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
ORDER BY posted_at DESC, id DESC LIMIT 21;

\echo '-- Deep page, keyset written with OR (the repository's first version)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
WHERE (posted_at < :'cur_posted_at' OR (posted_at = :'cur_posted_at' AND id < :'cur_id'))
ORDER BY posted_at DESC, id DESC LIMIT 21;

\echo ''
\echo '================ CREATE INDEX ================'
CREATE INDEX job_listings_posted_at_id_idx ON job_listings (posted_at DESC, id DESC);

\echo '================ AFTER ================'
\echo '-- First page'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
ORDER BY posted_at DESC, id DESC LIMIT 21;

\echo '-- Deep page, keyset written with OR'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
WHERE (posted_at < :'cur_posted_at' OR (posted_at = :'cur_posted_at' AND id < :'cur_id'))
ORDER BY posted_at DESC, id DESC LIMIT 21;

\echo '-- Deep page, keyset written as a range plus a tie-break (what the repository sends now)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
WHERE posted_at <= :'cur_posted_at'
  AND (posted_at < :'cur_posted_at' OR id < :'cur_id')
ORDER BY posted_at DESC, id DESC LIMIT 21;

\echo '-- Deep page, keyset written as a row comparison (needs raw SQL in Prisma)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, title, posted_at, company_id, source_id FROM job_listings
WHERE (posted_at, id) < (:'cur_posted_at'::timestamptz, :'cur_id'::uuid)
ORDER BY posted_at DESC, id DESC LIMIT 21;

ROLLBACK;
