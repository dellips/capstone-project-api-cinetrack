import { query } from "../db.js";
import { formatDateOnly, resolveDateRange, resolveOptionalDateRange } from "../utils/date.js";
import { createHttpError } from "../utils/http-error.js";
import { buildPaginationMeta, resolvePagination } from "../utils/pagination.js";
import { validateFilters } from "../utils/validation.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";

// Mengubah struktur tiket internal menjadi kontrak ticket yang lebih cocok untuk frontend.
function mapTiketToTicket(ticket) {
  return {
    ticket_id: ticket.tiket_id,
    schedule_id: ticket.schedule_id,
    movie_id: ticket.movie_id,
    cinema_id: ticket.cinema_id,
    seat_category: ticket.seat_category,
    final_price: ticket.final_price,
    trans_time: ticket.trans_time,
    payment_type: ticket.payment_type,
    status: ticket.status || "success",
    is_mock_status: true
  };
}

// Mengambil seluruh master film dan mengubah genre menjadi array agar mudah dipakai frontend.
export async function getAllMovies({
  search = null,
  genre = null,
  rating_usia = null,
  page = 1,
  limit = 20
} = {}) {
  const pagination = resolvePagination(page, limit);
  const params = [];
  const filters = [];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`m.title ILIKE $${params.length}`);
  }

  if (genre) {
    params.push(`%${genre}%`);
    filters.push(`m.genre ILIKE $${params.length}`);
  }

  if (rating_usia) {
    params.push(rating_usia);
    filters.push(`m.rating_usia = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM movies m
     ${whereClause}`,
    params
  );

  const rowsParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT movie_id, title, genre, rating_usia, duration_min
     FROM movies m
     ${whereClause}
     ORDER BY movie_id
     LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
    rowsParams
  );

  return {
    data: result.rows.map((movie) => ({
      movie_id: movie.movie_id,
      title: movie.title,
      genre: movie.genre ? movie.genre.split(",").map((item) => item.trim()) : [],
      rating_usia: movie.rating_usia,
      duration_min: Number(movie.duration_min || 0)
    })),
    meta: {
      filters: {
        search,
        genre,
        rating_usia
      },
      pagination: buildPaginationMeta(
        Number(countResult.rows[0]?.total || 0),
        pagination.page,
        pagination.limit
      )
    }
  };
}

// Mengambil seluruh master studio tanpa membatasi jumlah data.
export async function getAllStudios({
  cinema_id = null,
  studio_id = null,
  screen_type = null,
  page = 1,
  limit = 20
} = {}) {
  const pagination = resolvePagination(page, limit);
  const params = [];
  const filters = [];

  if (cinema_id) {
    params.push(cinema_id);
    filters.push(`st.cinema_id = $${params.length}`);
  }

  if (studio_id) {
    params.push(studio_id);
    filters.push(`st.studio_id = $${params.length}`);
  }

  if (screen_type) {
    params.push(screen_type);
    filters.push(`st.screen_type = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM studio st
     ${whereClause}`,
    params
  );

  const rowsParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT studio_id, cinema_id, studio_name, total_capacity, screen_type
     FROM studio st
     ${whereClause}
     ORDER BY studio_id
     LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
    rowsParams
  );

  return {
    data: result.rows.map((studio) => ({
      studio_id: studio.studio_id,
      cinema_id: studio.cinema_id,
      studio_name: studio.studio_name,
      total_capacity: Number(studio.total_capacity || 0),
      screen_type: studio.screen_type
    })),
    meta: {
      filters: {
        cinema_id,
        studio_id,
        screen_type
      },
      pagination: buildPaginationMeta(
        Number(countResult.rows[0]?.total || 0),
        pagination.page,
        pagination.limit
      )
    }
  };
}

// Mengambil seluruh jadwal film dan mengurutkannya dari yang terbaru.
export async function getSchedules({
  movie_id = null,
  cinema_id = null,
  studio_id = null,
  show_date = null,
  start_date = null,
  end_date = null,
  status = null,
  page = 1,
  limit = 20
} = {}) {
  await validateFilters({
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const pagination = resolvePagination(page, limit);
  const dateRange = resolveOptionalDateRange(start_date, end_date);
  const params = [];
  const filters = [];

  if (movie_id) {
    params.push(movie_id);
    filters.push(`s.movie_id = $${params.length}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    filters.push(`st.cinema_id = $${params.length}`);
  }

  if (studio_id) {
    params.push(studio_id);
    filters.push(`s.studio_id = $${params.length}`);
  }

  if (show_date) {
    params.push(show_date);
    filters.push(`CAST(s.show_date AS DATE) = CAST($${params.length} AS DATE)`);
  }

  if (dateRange) {
    params.push(start_date, end_date);
    filters.push(
      `CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`
    );
  }

  if (status) {
    params.push(status);
    filters.push(`s.status = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM schedules s
     JOIN studio st ON s.studio_id = st.studio_id
     ${whereClause}`,
    params
  );

  const rowsParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT
        s.schedule_id,
        s.movie_id,
        s.studio_id,
        s.show_date,
        s.start_time,
        s.price,
        s.status,
        st.cinema_id
     FROM schedules s
     JOIN studio st ON s.studio_id = st.studio_id
     ${whereClause}
     ORDER BY CAST(s.show_date AS DATE) DESC, CAST(s.start_time AS TIME) DESC
     LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
    rowsParams
  );

  return {
    data: result.rows.map((schedule) => ({
      schedule_id: schedule.schedule_id,
      movie_id: schedule.movie_id,
      studio_id: schedule.studio_id,
      cinema_id: schedule.cinema_id,
      show_date: schedule.show_date,
      start_time: schedule.start_time,
      price: Number(schedule.price || 0),
      status: schedule.status,
      actual_time: null,
      delay_minutes: null,
      is_mock_timing: true
    })),
    meta: {
      filters: {
        movie_id,
        cinema_id,
        studio_id,
        show_date,
        start_date,
        end_date,
        status
      },
      pagination: buildPaginationMeta(
        Number(countResult.rows[0]?.total || 0),
        pagination.page,
        pagination.limit
      )
    }
  };
}

// Mengambil seluruh transaksi tiket dan mengurutkannya dari transaksi terbaru.
export async function getTikets({
  schedule_id = null,
  movie_id = null,
  cinema_id = null,
  payment_type = null,
  seat_category = null,
  start_date = null,
  end_date = null,
  page = 1,
  limit = 20
} = {}) {
  await validateFilters({
    cinemaId: cinema_id
  });

  const pagination = resolvePagination(page, limit);
  const dateRange = resolveOptionalDateRange(start_date, end_date);
  const params = [];
  const filters = [];

  if (schedule_id) {
    params.push(schedule_id);
    filters.push(`t.schedule_id = $${params.length}`);
  }

  if (movie_id) {
    params.push(movie_id);
    filters.push(`s.movie_id = $${params.length}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    filters.push(`st.cinema_id = $${params.length}`);
  }

  if (payment_type) {
    params.push(payment_type);
    filters.push(`t.payment_type = $${params.length}`);
  }

  if (seat_category) {
    params.push(seat_category);
    filters.push(`t.seat_category = $${params.length}`);
  }

  if (dateRange) {
    params.push(dateRange.startDate.toISOString(), dateRange.endDate.toISOString());
    filters.push(`t.trans_time::timestamp BETWEEN $${params.length - 1} AND $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN studio st ON s.studio_id = st.studio_id
     ${whereClause}`,
    params
  );

  const rowsParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `SELECT
        t.tiket_id,
        t.schedule_id,
        t.seat_category,
        t.final_price,
        t.trans_time,
        t.payment_type,
        s.movie_id,
        st.cinema_id
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN studio st ON s.studio_id = st.studio_id
     ${whereClause}
     ORDER BY CAST(t.trans_time AS TIMESTAMP) DESC
     LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
    rowsParams
  );

  return {
    data: result.rows.map((tiket) => ({
      tiket_id: tiket.tiket_id,
      schedule_id: tiket.schedule_id,
      movie_id: tiket.movie_id,
      cinema_id: tiket.cinema_id,
      seat_category: tiket.seat_category,
      final_price: Number(tiket.final_price || 0),
      trans_time: tiket.trans_time,
      payment_type: tiket.payment_type,
      status: "success",
      is_mock_status: true
    })),
    meta: {
      filters: {
        schedule_id,
        movie_id,
        cinema_id,
        payment_type,
        seat_category,
        start_date,
        end_date
      },
      pagination: buildPaginationMeta(
        Number(countResult.rows[0]?.total || 0),
        pagination.page,
        pagination.limit
      )
    }
  };
}

// Menghitung ranking penjualan film berdasarkan filter kota, bioskop, dan mode top 10.
export async function getMoviesBySales({
  top10 = false,
  city = null,
  cinema_id = null,
  start_date = null,
  end_date = null
} = {}) {
  await validateFilters({
    city,
    cinemaId: cinema_id
  });

  return withCache(
    "movie-rankings",
    {
      top10: String(top10),
      city,
      cinema_id,
      start_date,
      end_date
    },
    config.cacheTtlSeconds,
    async () => {
      const dateRange = resolveOptionalDateRange(start_date, end_date);
      const effectiveDateRange = dateRange ?? resolveDateRange(undefined, undefined, "monthly");
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

      params.push(
        formatDateOnly(effectiveDateRange.startDate),
        formatDateOnly(effectiveDateRange.endDate)
      );
      filters.push(
        `CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`
      );

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
     ORDER BY COUNT(t.tiket_id) DESC, m.title ASC
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
  );
}

// Mengambil detail studio lengkap dengan ringkasan jadwal dan tiket yang terjual.
export async function getStudioDetail(studioId) {
  return withCache(
    "studio-detail",
    { studioId },
    config.cacheTtlSeconds,
    async () => {
      const result = await query(
        `SELECT
        st.studio_id,
        st.cinema_id,
        st.studio_name,
        st.total_capacity,
        st.screen_type,
        COUNT(DISTINCT s.schedule_id)::int AS total_schedules,
        COUNT(t.tiket_id)::int AS total_tickets
     FROM studio st
     LEFT JOIN schedules s ON st.studio_id = s.studio_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     WHERE st.studio_id = $1
     GROUP BY st.studio_id, st.cinema_id, st.studio_name, st.total_capacity, st.screen_type`,
        [studioId]
      );

      if (result.rowCount === 0) {
        throw createHttpError(404, "Studio not found", "STUDIO_NOT_FOUND");
      }

      const row = result.rows[0];

      return {
        studio_id: row.studio_id,
        cinema_id: row.cinema_id,
        studio_name: row.studio_name,
        total_capacity: Number(row.total_capacity || 0),
        capacity: Number(row.total_capacity || 0),
        screen_type: row.screen_type,
        total_schedules: Number(row.total_schedules || 0),
        total_tickets: Number(row.total_tickets || 0)
      };
    }
  );
}

// Mengambil detail jadwal lengkap beserta ringkasan penjualan untuk satu schedule.
export async function getScheduleDetail(scheduleId) {
  return withCache(
    "schedule-detail",
    { scheduleId },
    config.cacheTtlSeconds,
    async () => {
      const result = await query(
        `SELECT
        s.schedule_id,
        s.movie_id,
        s.studio_id,
        st.cinema_id,
        s.show_date,
        s.start_time,
        s.price,
        s.status,
        COUNT(t.tiket_id)::int AS tickets_sold,
        COALESCE(SUM(t.final_price), 0)::float8 AS revenue
     FROM schedules s
     JOIN studio st ON s.studio_id = st.studio_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     WHERE s.schedule_id = $1
     GROUP BY
       s.schedule_id,
       s.movie_id,
       s.studio_id,
       st.cinema_id,
       s.show_date,
       s.start_time,
       s.price,
       s.status`,
        [scheduleId]
      );

      if (result.rowCount === 0) {
        throw createHttpError(404, "Schedule not found", "SCHEDULE_NOT_FOUND");
      }

      const row = result.rows[0];

      return {
        schedule_id: row.schedule_id,
        movie_id: row.movie_id,
        studio_id: row.studio_id,
        cinema_id: row.cinema_id,
        show_date: row.show_date,
        start_time: row.start_time,
        price: Number(row.price || 0),
        status: row.status,
        actual_time: null,
        delay_minutes: null,
        is_mock_timing: true,
        tickets_sold: Number(row.tickets_sold || 0),
        revenue: Number(row.revenue || 0)
      };
    }
  );
}

// Mengambil detail tiket lengkap untuk kebutuhan sales drill-down di frontend.
export async function getTiketDetail(tiketId) {
  return withCache(
    "tiket-detail",
    { tiketId },
    config.cacheTtlSeconds,
    async () => {
      const result = await query(
        `SELECT
        t.tiket_id,
        t.schedule_id,
        t.seat_category,
        t.final_price,
        t.trans_time,
        t.payment_type,
        s.movie_id,
        s.studio_id,
        st.cinema_id
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN studio st ON s.studio_id = st.studio_id
     WHERE t.tiket_id = $1`,
        [tiketId]
      );

      if (result.rowCount === 0) {
        throw createHttpError(404, "Tiket not found", "TIKET_NOT_FOUND");
      }

      const row = result.rows[0];

      return {
        tiket_id: row.tiket_id,
        schedule_id: row.schedule_id,
        movie_id: row.movie_id,
        studio_id: row.studio_id,
        cinema_id: row.cinema_id,
        seat_category: row.seat_category,
        final_price: Number(row.final_price || 0),
        trans_time: row.trans_time,
        payment_type: row.payment_type,
        status: "success",
        is_mock_status: true
      };
    }
  );
}

// Menyediakan alias /tickets dengan nama field yang lebih umum untuk frontend baru.
export async function getTickets(filters = {}) {
  const result = await getTikets(filters);

  return {
    data: result.data.map(mapTiketToTicket),
    meta: result.meta
  };
}

// Menyediakan detail ticket tunggal tanpa mengubah endpoint /tikets yang lama.
export async function getTicketDetail(ticketId) {
  return mapTiketToTicket(await getTiketDetail(ticketId));
}
