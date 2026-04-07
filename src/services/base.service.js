import { query } from "../db.js";
import { validateFilters } from "../utils/validation.js";

// Mengambil seluruh master film dan mengubah genre menjadi array agar mudah dipakai frontend.
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
    duration_min: Number(movie.duration_min || 0)
  }));
}

// Mengambil seluruh master studio tanpa membatasi jumlah data.
export async function getAllStudios() {
  const result = await query(
    `SELECT studio_id, cinema_id, studio_name, total_capacity, screen_type
     FROM studio
     ORDER BY studio_id`
  );

  return result.rows.map((studio) => ({
    studio_id: studio.studio_id,
    cinema_id: studio.cinema_id,
    studio_name: studio.studio_name,
    total_capacity: Number(studio.total_capacity || 0),
    screen_type: studio.screen_type
  }));
}

// Mengambil seluruh jadwal film dan mengurutkannya dari yang terbaru.
export async function getSchedules() {
  const result = await query(
    `SELECT schedule_id, movie_id, studio_id, show_date, start_time, price, status
     FROM schedules
     ORDER BY CAST(show_date AS DATE) DESC, CAST(start_time AS TIME) DESC`
  );

  return result.rows.map((schedule) => ({
    schedule_id: schedule.schedule_id,
    movie_id: schedule.movie_id,
    studio_id: schedule.studio_id,
    show_date: schedule.show_date,
    start_time: schedule.start_time,
    price: Number(schedule.price || 0),
    status: schedule.status
  }));
}

// Mengambil seluruh transaksi tiket dan mengurutkannya dari transaksi terbaru.
export async function getTikets() {
  const result = await query(
    `SELECT tiket_id, schedule_id, seat_category, final_price, trans_time, payment_type
     FROM tiket
     ORDER BY CAST(trans_time AS TIMESTAMP) DESC`
  );

  return result.rows.map((tiket) => ({
    tiket_id: tiket.tiket_id,
    schedule_id: tiket.schedule_id,
    seat_category: tiket.seat_category,
    final_price: Number(tiket.final_price || 0),
    trans_time: tiket.trans_time,
    payment_type: tiket.payment_type
  }));
}

// Menghitung ranking penjualan film berdasarkan filter kota, bioskop, dan mode top 10.
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
