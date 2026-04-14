-- Priority indexes for P1 dashboard bottlenecks
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_tiket_schedule_id
  ON tiket (schedule_id);

CREATE INDEX IF NOT EXISTS idx_schedules_show_date_studio
  ON schedules (show_date, studio_id);

CREATE INDEX IF NOT EXISTS idx_schedules_show_date_movie
  ON schedules (show_date, movie_id);

CREATE INDEX IF NOT EXISTS idx_studio_cinema_id
  ON studio (cinema_id);

CREATE INDEX IF NOT EXISTS idx_cinema_city_cinema_id
  ON cinema (city, cinema_id);

-- Optional
CREATE INDEX IF NOT EXISTS idx_schedules_show_date_start_time
  ON schedules (show_date, start_time);
