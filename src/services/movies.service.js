import { query } from "../db.js";
import { createHttpError } from "../utils/http-error.js";

// Mengambil detail film, metrik penjualan, dan distribusi kursi untuk halaman detail.
export async function getMovieDetail(movieId) {
  const movieResult = await query(
    `SELECT
        m.movie_id,
        m.title,
        m.genre,
        m.rating_usia,
        m.duration_min
     FROM movies m
     WHERE m.movie_id = $1`,
    [movieId]
  );

  if (movieResult.rowCount === 0) {
    throw createHttpError(404, "Movie not found", "MOVIE_NOT_FOUND");
  }

  const statsResult = await query(
    `SELECT
        t.tiket_id,
        t.final_price,
        t.seat_category,
        st.cinema_id
     FROM schedules s
     JOIN studio st ON s.studio_id = st.studio_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     WHERE s.movie_id = $1`,
    [movieId]
  );

  const rows = statsResult.rows;
  const movie = movieResult.rows[0];
  const seatDistribution = {};
  const cinemas = new Set();
  let totalRevenue = 0;
  let totalTickets = 0;

  for (const row of rows) {
    if (row.cinema_id) {
      cinemas.add(String(row.cinema_id));
    }

    if (!row.tiket_id) {
      continue;
    }

    totalTickets += 1;
    totalRevenue += Number(row.final_price || 0);

    if (row.seat_category) {
      seatDistribution[row.seat_category] = (seatDistribution[row.seat_category] || 0) + 1;
    }
  }

  return {
    movie: {
      movie_id: String(movie.movie_id),
      title: String(movie.title),
      genre: movie.genre ? movie.genre.split(",").map((item) => item.trim()) : [],
      rating_usia: movie.rating_usia,
      duration_min: Number(movie.duration_min || 0)
    },
    metrics: {
      total_tickets: totalTickets,
      total_revenue: totalRevenue,
      avg_ticket_price: totalTickets > 0 ? totalRevenue / totalTickets : 0
    },
    showing_at: Array.from(cinemas),
    seat_distribution: seatDistribution
  };
}
