import { query } from "../db.js";

export async function getMovieDetail(movieId) {
  const result = await query(
    `SELECT
        m.movie_id,
        m.title,
        m.genre,
        m.duration_min,
        t.tiket_id,
        t.final_price,
        t.seat_category,
        s.schedule_id,
        st.cinema_id
     FROM movies m
     JOIN schedules s ON m.movie_id = s.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN tiket t ON s.schedule_id = t.schedule_id
     WHERE m.movie_id = $1`,
    [movieId]
  );

  if (result.rowCount === 0) {
    return {};
  }

  const rows = result.rows;
  const first = rows[0];
  const seatDistribution = {};
  const cinemas = new Set();
  let totalRevenue = 0;

  for (const row of rows) {
    totalRevenue += Number(row.final_price || 0);
    cinemas.add(String(row.cinema_id));
    seatDistribution[row.seat_category] = (seatDistribution[row.seat_category] || 0) + 1;
  }

  return {
    movie: {
      movie_id: String(first.movie_id),
      title: String(first.title),
      genre: first.genre,
      duration_min: Number(first.duration_min)
    },
    metrics: {
      total_tickets: rows.length,
      total_revenue: totalRevenue,
      avg_ticket_price: rows.length > 0 ? totalRevenue / rows.length : 0
    },
    showing_at: Array.from(cinemas),
    seat_distribution: seatDistribution
  };
}
