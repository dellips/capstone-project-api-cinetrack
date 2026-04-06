import { query } from "../db.js";
import { validateFilters } from "../utils/validation.js";

export async function getAllMovies() {
  const result = await query(
    `SELECT movie_id, title, genre, rating_usia, duration_min
     FROM movies
     ORDER BY movie_id`
  );

  return result.rows.map((movie) => ({
    movie_id: movie.movie_id,
    title: movie.title,
    genre: movie.genre ? movie.genre.split(",").map((item) => item.trim()) : [],
    rating_usia: movie.rating_usia,
    duration_min: movie.duration_min
  }));
}

export async function getAllStudios() {
  const result = await query(
    `SELECT studio_id, cinema_id, studio_name, total_capacity, screen_type
     FROM studio
     ORDER BY studio_id`
  );

  return result.rows;
}

export async function getSchedules(limit = 10) {
  const result = await query(
    `SELECT schedule_id, movie_id, studio_id, show_date, start_time, price, status
     FROM schedules
     ORDER BY CAST(show_date AS DATE) DESC, CAST(start_time AS TIME) DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export async function getTikets(limit = 10) {
  const result = await query(
    `SELECT tiket_id, schedule_id, seat_category, final_price, trans_time, payment_type
     FROM tiket
     ORDER BY CAST(trans_time AS TIMESTAMP) DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export async function getMoviesBySales({ top10 = false, city = null, cinema_id = null } = {}) {
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
    filters.push(`st.cinema_id = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const limitClause = String(top10) === "true" || top10 === true ? "LIMIT 10" : "";

  const result = await query(
    `SELECT
        m.movie_id,
        m.title,
        m.genre,
        m.rating_usia,
        m.duration_min,
        COUNT(t.tiket_id)::int AS tickets_sold,
        COALESCE(SUM(t.final_price), 0)::float8 AS revenue
     FROM movies m
     JOIN schedules s ON s.movie_id = m.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     LEFT JOIN tiket t ON t.schedule_id = s.schedule_id
     ${whereClause}
     GROUP BY m.movie_id, m.title, m.genre, m.rating_usia, m.duration_min
     ORDER BY COUNT(t.tiket_id) DESC
     ${limitClause}`,
    params
  );

  return result.rows.map((row) => ({
    movie_id: row.movie_id,
    title: row.title || "Unknown",
    genre: row.genre ? row.genre.split(",").map((item) => item.trim()) : [],
    rating_usia: row.rating_usia,
    duration_min: Number(row.duration_min || 0),
    tickets_sold: Number(row.tickets_sold || 0),
    revenue: Number(row.revenue || 0)
  }));
}
