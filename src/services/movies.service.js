import { query } from "../db.js";
import { formatDateOnly, resolveOptionalDateRange } from "../utils/date.js";
import { createHttpError } from "../utils/http-error.js";
import { validateFilters } from "../utils/validation.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";

// Mengambil detail film, metrik penjualan, dan distribusi kursi untuk halaman detail.
export async function getMovieDetail(movieId) {
  return withCache(
    "movie-detail",
    { movieId },
    config.cacheTtlSeconds,
    async () => {
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
  );
}

// Menghitung performa film untuk periode tertentu beserta tren penjualan per hari.
export async function getMoviePerformance(
  movieId,
  { city = null, cinema_id = null, start_date = null, end_date = null } = {}
) {
  return withCache(
    "movie-performance-v2",
    { movieId, city, cinema_id, start_date, end_date },
    config.cacheTtlSeconds,
    async () => {
      await validateFilters({
        city,
        cinemaId: cinema_id
      });

      await getMovieDetail(movieId);
      const dateRange = resolveOptionalDateRange(start_date, end_date);
      const params = [movieId];
      const filters = ["s.movie_id = $1"];

      if (city) {
        params.push(city);
        filters.push(`c.city = $${params.length}`);
      }

      if (cinema_id) {
        params.push(cinema_id);
        filters.push(`st.cinema_id = $${params.length}`);
      }

      if (dateRange) {
        params.push(formatDateOnly(dateRange.startDate), formatDateOnly(dateRange.endDate));
        filters.push(
          `CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`
        );
      }

      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const metricsResult = await query(
        `SELECT
        COUNT(t.tiket_id)::int AS total_tickets,
        COALESCE(SUM(t.final_price), 0)::float8 AS total_revenue,
        COUNT(DISTINCT st.cinema_id)::int AS showing_at_count
     FROM schedules s
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     ${whereClause}`,
        params
      );

      const trendResult = await query(
        `SELECT
        CAST(s.show_date AS DATE) AS time_group,
        COUNT(t.tiket_id)::int AS tickets_sold,
        COALESCE(SUM(t.final_price), 0)::float8 AS revenue
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     WHERE ${filters.join(" AND ")}
     GROUP BY CAST(s.show_date AS DATE)
     ORDER BY CAST(s.show_date AS DATE)`,
        params
      );

      const distributionResult = await query(
        `SELECT
        st.cinema_id,
        t.seat_category,
        COUNT(t.tiket_id)::int AS total_tickets
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     WHERE ${filters.join(" AND ")}
     GROUP BY st.cinema_id, t.seat_category`,
        params
      );

      const metricsRow = metricsResult.rows[0] || {};
      const seatDistribution = {};
      const cinemas = new Set();

      for (const row of distributionResult.rows) {
        cinemas.add(String(row.cinema_id));
        seatDistribution[row.seat_category] = Number(row.total_tickets || 0);
      }

      return {
        metrics: {
          total_tickets: Number(metricsRow.total_tickets || 0),
          total_revenue: Number(metricsRow.total_revenue || 0),
          avg_ticket_price:
            Number(metricsRow.total_tickets || 0) > 0
              ? Number((Number(metricsRow.total_revenue || 0) / Number(metricsRow.total_tickets || 0)).toFixed(2))
              : 0,
          showing_at_count: Number(metricsRow.showing_at_count || 0)
        },
        showing_at: Array.from(cinemas),
        seat_distribution: seatDistribution,
        trend: trendResult.rows.map((row) => ({
          time_group: row.time_group,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: Number(row.revenue || 0)
        }))
      };
    }
  );
}
