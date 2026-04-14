-- P1 endpoint profiling templates
-- Usage example:
--   psql "$DATABASE_URL" -v city="'Jakarta'" -v start_date="'2026-04-01'" -v end_date="'2026-04-14'" -f scripts/explain-p1-endpoints.sql
--
-- If you do not pass variables via -v, defaults below are used.

\set city '''Jakarta'''
\set cinema_id 'NULL'
\set studio_id 'NULL'
\set movie_id 'NULL'
\set start_date '''2026-04-01'''
\set end_date '''2026-04-14'''
\set top_n '20'
\set min_competitor_occupancy '70'
\set max_impacted_occupancy '40'

SET statement_timeout = '120s';
SET lock_timeout = '5s';
SET idle_in_transaction_session_timeout = '60s';

-- ============================================================
-- 1) /api/v1/dashboard/sales/analytics
-- Candidate bottleneck: getSalesTimeSlots() from dashboard.service.js
-- ============================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
WITH slot_stats AS (
  SELECT
    LPAD(EXTRACT(HOUR FROM CAST(s.start_time AS TIME))::int::text, 2, '0') || ':00' AS time_slot,
    s.schedule_id,
    st.total_capacity,
    COUNT(t.tiket_id)::int AS demand,
    COALESCE(SUM(t.final_price), 0)::float8 AS revenue
  FROM schedules s
  JOIN studio st ON s.studio_id = st.studio_id
  JOIN cinema c ON st.cinema_id = c.cinema_id
  LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
  WHERE
    (:city::text IS NULL OR c.city = :city::text)
    AND (:cinema_id::text IS NULL OR st.cinema_id = :cinema_id::text)
    AND (:studio_id::text IS NULL OR s.studio_id = :studio_id::text)
    AND (:movie_id::text IS NULL OR s.movie_id = :movie_id::text)
    AND CAST(s.show_date AS DATE) BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)
  GROUP BY time_slot, s.schedule_id, st.total_capacity
)
SELECT
  time_slot,
  SUM(demand)::int AS demand,
  SUM(revenue)::float8 AS revenue,
  SUM(total_capacity)::int AS total_capacity
FROM slot_stats
GROUP BY time_slot
ORDER BY time_slot;

-- ============================================================
-- 2) /api/v1/dashboard/films/analytics
-- Candidate bottleneck: getFilmsSchedules() schedule_performance query
-- ============================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT
  s.schedule_id,
  s.movie_id,
  m.title,
  s.show_date,
  s.start_time,
  st.studio_id,
  st.cinema_id,
  st.total_capacity,
  COUNT(t.tiket_id)::int AS total_tickets,
  COALESCE(SUM(t.final_price), 0)::float8 AS revenue
FROM schedules s
JOIN movies m ON s.movie_id = m.movie_id
JOIN studio st ON s.studio_id = st.studio_id
JOIN cinema c ON st.cinema_id = c.cinema_id
LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
WHERE
  (:city::text IS NULL OR c.city = :city::text)
  AND (:cinema_id::text IS NULL OR st.cinema_id = :cinema_id::text)
  AND (:studio_id::text IS NULL OR s.studio_id = :studio_id::text)
  AND (:movie_id::text IS NULL OR s.movie_id = :movie_id::text)
  AND CAST(s.show_date AS DATE) BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)
GROUP BY
  s.schedule_id,
  s.movie_id,
  m.title,
  s.show_date,
  s.start_time,
  st.studio_id,
  st.cinema_id,
  st.total_capacity
ORDER BY CAST(s.show_date AS DATE) DESC, CAST(s.start_time AS TIME) DESC;

-- ============================================================
-- 3) /api/v1/dashboard/executive
-- Candidate bottleneck: getCityRevenueRows() query
-- ============================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
WITH per_schedule AS (
  SELECT
    c.city,
    c.cinema_id,
    s.schedule_id,
    st.total_capacity,
    COUNT(t.tiket_id)::int AS total_tickets,
    COALESCE(SUM(t.final_price), 0)::float8 AS total_revenue,
    CASE
      WHEN st.total_capacity > 0
        THEN COUNT(t.tiket_id)::float8 / st.total_capacity::float8
      ELSE 0
    END AS schedule_occupancy
  FROM schedules s
  JOIN studio st ON s.studio_id = st.studio_id
  JOIN cinema c ON st.cinema_id = c.cinema_id
  LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
  WHERE
    (:city::text IS NULL OR c.city = :city::text)
    AND (:cinema_id::text IS NULL OR st.cinema_id = :cinema_id::text)
    AND (:studio_id::text IS NULL OR s.studio_id = :studio_id::text)
    AND CAST(s.show_date AS DATE) BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)
  GROUP BY c.city, c.cinema_id, s.schedule_id, st.total_capacity
)
SELECT
  city,
  COUNT(DISTINCT cinema_id)::int AS total_cinemas,
  SUM(total_tickets)::int AS total_tickets,
  SUM(total_revenue)::float8 AS total_revenue,
  SUM(total_capacity)::int AS total_capacity,
  COUNT(schedule_id)::int AS total_shows,
  AVG(schedule_occupancy)::float8 AS avg_occupancy
FROM per_schedule
GROUP BY city
ORDER BY SUM(total_revenue) DESC, SUM(total_tickets) DESC, city ASC;

-- ============================================================
-- Optional deep-dive for /analytics/cannibalization (often heavy too)
-- ============================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
WITH per_schedule AS (
  SELECT
    c.cinema_id,
    c.cinema_name,
    c.city,
    s.show_date,
    LPAD(EXTRACT(HOUR FROM CAST(s.start_time AS TIME))::int::text, 2, '0') || ':00' AS time_slot,
    s.movie_id,
    m.title,
    s.schedule_id,
    st.total_capacity,
    COUNT(t.tiket_id)::int AS total_tickets
  FROM schedules s
  JOIN movies m ON s.movie_id = m.movie_id
  JOIN studio st ON s.studio_id = st.studio_id
  JOIN cinema c ON st.cinema_id = c.cinema_id
  LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
  WHERE
    (:city::text IS NULL OR c.city = :city::text)
    AND (:cinema_id::text IS NULL OR st.cinema_id = :cinema_id::text)
    AND (:studio_id::text IS NULL OR s.studio_id = :studio_id::text)
    AND CAST(s.show_date AS DATE) BETWEEN CAST(:start_date AS DATE) AND CAST(:end_date AS DATE)
  GROUP BY
    c.cinema_id,
    c.cinema_name,
    c.city,
    s.show_date,
    time_slot,
    s.movie_id,
    m.title,
    s.schedule_id,
    st.total_capacity
)
SELECT
  cinema_id,
  cinema_name,
  city,
  show_date,
  time_slot,
  movie_id,
  title,
  COALESCE(SUM(total_tickets), 0)::int AS total_tickets,
  COALESCE(SUM(total_capacity), 0)::int AS total_capacity
FROM per_schedule
GROUP BY cinema_id, cinema_name, city, show_date, time_slot, movie_id, title
ORDER BY cinema_id, show_date, time_slot, title;
