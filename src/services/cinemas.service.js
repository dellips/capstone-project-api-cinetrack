import { query } from "../db.js";
import { validateFilters } from "../utils/validation.js";

// Menghitung ringkasan dan breakdown bioskop berdasarkan filter yang dikirim frontend.
export async function getCinemas({ city = null, cinema_id = null } = {}) {
  await validateFilters({
    city,
    cinemaId: cinema_id
  });

  const params = [];
  const filters = [];

  if (city) {
    params.push(city);
    filters.push(`c.city = $${params.length}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    filters.push(`c.cinema_id = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await query(
    `WITH filtered_cinemas AS (
        SELECT
          c.cinema_id,
          c.cinema_name,
          c.city,
          c.address
        FROM cinema c
        ${whereClause}
      ),
      cinema_metrics AS (
        SELECT
          fc.cinema_id,
          fc.cinema_name,
          fc.city,
          fc.address,
          COUNT(t.tiket_id)::int AS total_tickets,
          COALESCE(SUM(t.final_price), 0)::float8 AS total_revenue,
          COUNT(DISTINCT s.movie_id)::int AS active_movies,
          COUNT(DISTINCT CASE WHEN t.tiket_id IS NOT NULL THEN st.studio_id END)::int AS active_studios
        FROM filtered_cinemas fc
        LEFT JOIN studio st ON fc.cinema_id = st.cinema_id
        LEFT JOIN schedules s ON st.studio_id = s.studio_id
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
        GROUP BY fc.cinema_id, fc.cinema_name, fc.city, fc.address
      ),
      top_movie_ranked AS (
        SELECT
          fc.cinema_id,
          m.movie_id,
          m.title,
          COUNT(t.tiket_id)::int AS tickets_sold,
          ROW_NUMBER() OVER (
            PARTITION BY fc.cinema_id
            ORDER BY COUNT(t.tiket_id) DESC, m.title ASC
          ) AS row_num
        FROM filtered_cinemas fc
        JOIN studio st ON fc.cinema_id = st.cinema_id
        JOIN schedules s ON st.studio_id = s.studio_id
        JOIN movies m ON s.movie_id = m.movie_id
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
        GROUP BY fc.cinema_id, m.movie_id, m.title
      ),
      top_genre_ranked AS (
        SELECT
          fc.cinema_id,
          TRIM(genre_item) AS genre,
          COUNT(t.tiket_id)::int AS tickets_sold,
          ROW_NUMBER() OVER (
            PARTITION BY fc.cinema_id
            ORDER BY COUNT(t.tiket_id) DESC, TRIM(genre_item) ASC
          ) AS row_num
        FROM filtered_cinemas fc
        JOIN studio st ON fc.cinema_id = st.cinema_id
        JOIN schedules s ON st.studio_id = s.studio_id
        JOIN movies m ON s.movie_id = m.movie_id
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
        CROSS JOIN LATERAL unnest(string_to_array(COALESCE(m.genre, ''), ',')) AS genre_item
        WHERE TRIM(genre_item) <> ''
        GROUP BY fc.cinema_id, TRIM(genre_item)
      )
      SELECT
        cm.cinema_id,
        cm.cinema_name,
        cm.city,
        cm.address,
        cm.total_tickets,
        cm.total_revenue,
        cm.active_movies,
        cm.active_studios,
        tm.movie_id AS top_movie_id,
        tm.title AS top_movie_title,
        tm.tickets_sold AS top_movie_tickets_sold,
        tg.genre AS top_genre,
        tg.tickets_sold AS top_genre_tickets_sold
      FROM cinema_metrics cm
      LEFT JOIN top_movie_ranked tm
        ON cm.cinema_id = tm.cinema_id
        AND tm.row_num = 1
      LEFT JOIN top_genre_ranked tg
        ON cm.cinema_id = tg.cinema_id
        AND tg.row_num = 1
      ORDER BY cm.cinema_id`,
    params
  );

  const breakdown = result.rows.map((row) => ({
    cinema_id: row.cinema_id,
    cinema_name: row.cinema_name,
    city: row.city,
    address: row.address,
    metrics: {
      total_tickets: Number(row.total_tickets || 0),
      total_revenue: Number(row.total_revenue || 0),
      active_movies: Number(row.active_movies || 0),
      active_studios: Number(row.active_studios || 0)
    },
    top_movie: row.top_movie_title
      ? {
          movie_id: row.top_movie_id,
          title: row.top_movie_title,
          tickets_sold: Number(row.top_movie_tickets_sold || 0)
        }
      : null,
    top_genre: row.top_genre
      ? {
          genre: row.top_genre,
          tickets_sold: Number(row.top_genre_tickets_sold || 0)
        }
      : null
  }));

  const summary = breakdown.reduce(
    (accumulator, item) => ({
      total_cinemas: accumulator.total_cinemas + 1,
      active_cinemas: accumulator.active_cinemas + (item.metrics.total_tickets > 0 ? 1 : 0),
      total_tickets: accumulator.total_tickets + item.metrics.total_tickets,
      total_revenue: accumulator.total_revenue + item.metrics.total_revenue
    }),
    {
      total_cinemas: 0,
      active_cinemas: 0,
      total_tickets: 0,
      total_revenue: 0
    }
  );

  return {
    summary: {
      total_cinemas: summary.total_cinemas,
      active_cinemas: summary.active_cinemas,
      total_tickets: summary.total_tickets,
      total_revenue: Number(summary.total_revenue.toFixed(2))
    },
    breakdown
  };
}
