import { query } from "../db.js";

// Mengambil status koneksi dan aktivitas tiket terbaru untuk indikator health frontend.
export async function getSystemHealth() {
  try {
    await query("SELECT 1");

    const lastResult = await query(
      "SELECT MAX(CAST(trans_time AS TIMESTAMP)) AS last_data_in FROM tiket"
    );

    const lastDataIn = lastResult.rows[0]?.last_data_in ?? null;
    const windowEnd = lastDataIn ? new Date(lastDataIn) : new Date();
    const windowStart = new Date(windowEnd.getTime() - (60 * 60 * 1000));

    const [countResult, cityResult, studioResult, movieResult] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS tickets_last_hour
         FROM tiket
         WHERE CAST(trans_time AS TIMESTAMP) BETWEEN $1 AND $2`,
        [windowStart, windowEnd]
      ),
      query(
        `SELECT
           c.city,
           COUNT(t.tiket_id)::int AS tickets_sold,
           COALESCE(SUM(t.final_price), 0)::float8 AS revenue
         FROM tiket t
         JOIN schedules s ON t.schedule_id = s.schedule_id
         JOIN studio st ON s.studio_id = st.studio_id
         JOIN cinema c ON st.cinema_id = c.cinema_id
         WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $1 AND $2
         GROUP BY c.city
         ORDER BY COUNT(t.tiket_id) DESC, c.city ASC`,
        [windowStart, windowEnd]
      ),
      query(
        `SELECT
           st.studio_id,
           st.studio_name,
           st.cinema_id,
           c.city,
           COUNT(t.tiket_id)::int AS tickets_sold,
           COALESCE(SUM(t.final_price), 0)::float8 AS revenue
         FROM tiket t
         JOIN schedules s ON t.schedule_id = s.schedule_id
         JOIN studio st ON s.studio_id = st.studio_id
         JOIN cinema c ON st.cinema_id = c.cinema_id
         WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $1 AND $2
         GROUP BY st.studio_id, st.studio_name, st.cinema_id, c.city
         ORDER BY COUNT(t.tiket_id) DESC, st.studio_id ASC`,
        [windowStart, windowEnd]
      ),
      query(
        `SELECT
           m.movie_id,
           m.title,
           COUNT(t.tiket_id)::int AS tickets_sold,
           COALESCE(SUM(t.final_price), 0)::float8 AS revenue
         FROM tiket t
         JOIN schedules s ON t.schedule_id = s.schedule_id
         JOIN movies m ON s.movie_id = m.movie_id
         WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $1 AND $2
         GROUP BY m.movie_id, m.title
         ORDER BY COUNT(t.tiket_id) DESC, m.title ASC`,
        [windowStart, windowEnd]
      )
    ]);

    return {
      status: "active",
      last_data_in: lastDataIn
        ? new Date(lastDataIn).toISOString()
        : null,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      tickets_last_hour: Number(countResult.rows[0]?.tickets_last_hour || 0),
      breakdown: {
        by_city: cityResult.rows.map((row) => ({
          city: row.city,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: Number(row.revenue || 0)
        })),
        by_studio: studioResult.rows.map((row) => ({
          studio_id: row.studio_id,
          studio_name: row.studio_name,
          cinema_id: row.cinema_id,
          city: row.city,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: Number(row.revenue || 0)
        })),
        by_movie: movieResult.rows.map((row) => ({
          movie_id: row.movie_id,
          title: row.title,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: Number(row.revenue || 0)
        }))
      }
    };
  } catch (error) {
    return {
      status: "inactive",
      last_data_in: null,
      window_start: null,
      window_end: null,
      tickets_last_hour: 0,
      breakdown: {
        by_city: [],
        by_studio: [],
        by_movie: []
      }
    };
  }
}
