import { query } from "../db.js";
import { formatDateOnly, resolveOptionalDateRange } from "../utils/date.js";
import { createHttpError } from "../utils/http-error.js";
import { buildPaginationMeta, resolvePagination } from "../utils/pagination.js";
import { validateFilters } from "../utils/validation.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";

function roundMetric(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

// Menyusun filter bioskop agar list, stats, dan performance memakai logika yang sama.
function buildCinemaFilters({ city = null, cinema_id = null, studio_id = null } = {}) {
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

  if (studio_id) {
    params.push(studio_id);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM studio st_filter
        WHERE st_filter.cinema_id = c.cinema_id
          AND st_filter.studio_id = $${params.length}
      )`
    );
  }

  return {
    params,
    whereClause: filters.length ? `WHERE ${filters.join(" AND ")}` : ""
  };
}

// Menyusun query agregat per bioskop yang dipakai dashboard dan endpoint stats/cinema.
async function getCinemaBreakdownRows({
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null,
  start_date = null,
  end_date = null
} = {}) {
  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const dateRange = resolveOptionalDateRange(start_date, end_date);
  const { params, whereClause } = buildCinemaFilters({ city, cinema_id, studio_id });
  let ticketDateFilter = "";
  const salesFilters = [];
  const activeMovieFilters = [];

  if (movie_id) {
    params.push(movie_id);
    salesFilters.push(`s.movie_id = $${params.length}`);
    activeMovieFilters.push(`s.movie_id = $${params.length}`);
  }

  if (dateRange) {
    params.push(dateRange.startDate, dateRange.endDate);
    ticketDateFilter = `AND t.trans_time::timestamp BETWEEN $${params.length - 1} AND $${params.length}`;
    params.push(formatDateOnly(dateRange.startDate), formatDateOnly(dateRange.endDate));
    activeMovieFilters.push(
      `CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`
    );
  }

  const salesWhereClause = salesFilters.length ? `AND ${salesFilters.join(" AND ")}` : "";
  const activeMovieWhereClause = activeMovieFilters.length ? `AND ${activeMovieFilters.join(" AND ")}` : "";

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
          COALESCE(SUM(CAST(t.final_price AS NUMERIC)), 0)::numeric AS total_revenue,
          COUNT(DISTINCT CASE WHEN t.tiket_id IS NOT NULL THEN st.studio_id END)::int AS active_studios
        FROM filtered_cinemas fc
        LEFT JOIN studio st ON fc.cinema_id = st.cinema_id
        LEFT JOIN schedules s ON st.studio_id = s.studio_id
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id ${ticketDateFilter}
        WHERE 1 = 1 ${salesWhereClause}
        GROUP BY fc.cinema_id, fc.cinema_name, fc.city, fc.address
      ),
      active_movie_metrics AS (
        SELECT
          fc.cinema_id,
          COUNT(DISTINCT s.movie_id)::int AS active_movies
        FROM filtered_cinemas fc
        JOIN studio st ON fc.cinema_id = st.cinema_id
        JOIN schedules s ON st.studio_id = s.studio_id
        WHERE 1 = 1 ${activeMovieWhereClause}
        GROUP BY fc.cinema_id
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
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id ${ticketDateFilter}
        WHERE 1 = 1 ${salesWhereClause}
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
        WHERE TRIM(genre_item) <> '' ${salesWhereClause}
        GROUP BY fc.cinema_id, TRIM(genre_item)
      ),
      cinema_schedule_capacity AS (
        SELECT
          fc.cinema_id,
          COALESCE(SUM(st.total_capacity), 0)::bigint AS total_capacity
        FROM filtered_cinemas fc
        JOIN studio st ON fc.cinema_id = st.cinema_id
        JOIN schedules s ON st.studio_id = s.studio_id
        WHERE 1 = 1 ${scheduleDateFilter}
        GROUP BY fc.cinema_id
      )
      SELECT
        cm.cinema_id,
        cm.cinema_name,
        cm.city,
        cm.address,
        cm.total_tickets,
        cm.total_revenue,
        COALESCE(amm.active_movies, 0)::int AS active_movies,
        cm.active_studios,
        COALESCE(csc.total_capacity, 0)::bigint AS total_capacity,
        tm.movie_id AS top_movie_id,
        tm.title AS top_movie_title,
        tm.tickets_sold AS top_movie_tickets_sold,
        tg.genre AS top_genre,
        tg.tickets_sold AS top_genre_tickets_sold
      FROM cinema_metrics cm
      LEFT JOIN active_movie_metrics amm
        ON cm.cinema_id = amm.cinema_id
      LEFT JOIN top_movie_ranked tm
        ON cm.cinema_id = tm.cinema_id
        AND tm.row_num = 1
      LEFT JOIN top_genre_ranked tg
        ON cm.cinema_id = tg.cinema_id
        AND tg.row_num = 1
      ORDER BY cm.cinema_id`,
    params
  );

  return result.rows.map((row) => {
    const totalTickets = Number(row.total_tickets || 0);
    const totalCapacity = Number(row.total_capacity || 0);
    const occupancy = totalCapacity > 0 ? roundMetric((totalTickets * 100) / totalCapacity) : 0;

    return {
    cinema_id: row.cinema_id,
    cinema_name: row.cinema_name,
    city: row.city,
    address: row.address,
    status: Number(row.total_tickets || 0) > 0 ? "active" : "inactive",
    lat: null,
    lng: null,
    is_mock_location: true,
    metrics: {
      total_tickets: totalTickets,
      total_revenue: Number(row.total_revenue || 0),
      active_movies: Number(row.active_movies || 0),
      active_studios: Number(row.active_studios || 0),
      total_capacity: totalCapacity,
      occupancy
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
    };
  });
}

// Mengembalikan breakdown bioskop untuk dashboard dengan dukungan pagination ringan.
export async function getCinemas({ city = null, cinema_id = null, page = 1, limit = 20 } = {}) {
  const breakdownRows = await getCinemaBreakdownRows({ city, cinema_id });
  const pagination = resolvePagination(page, limit);
  const pagedRows = breakdownRows.slice(pagination.offset, pagination.offset + pagination.limit);

  const summary = breakdownRows.reduce(
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
    data: {
      summary: {
        total_cinemas: summary.total_cinemas,
        active_cinemas: summary.active_cinemas,
        total_tickets: summary.total_tickets,
        total_revenue: Number(summary.total_revenue.toFixed(2))
      },
      breakdown: pagedRows
    },
    meta: {
      filters: {
        city,
        cinema_id
      },
      pagination: buildPaginationMeta(breakdownRows.length, pagination.page, pagination.limit)
    }
  };
}

// Mengambil detail satu bioskop beserta hitungan studio, jadwal, dan tiket yang terkait.
export async function getCinemaDetail(cinemaId) {
  return withCache(
    "cinema-detail",
    { cinemaId },
    config.cacheTtlSeconds,
    async () => {
      const result = await query(
        `SELECT
        c.cinema_id,
        c.cinema_name,
        c.city,
        c.address,
        COUNT(DISTINCT st.studio_id)::int AS total_studios,
        COUNT(DISTINCT s.schedule_id)::int AS total_schedules,
        COUNT(t.tiket_id)::int AS total_tickets
     FROM cinema c
     LEFT JOIN studio st ON c.cinema_id = st.cinema_id
     LEFT JOIN schedules s ON st.studio_id = s.studio_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     WHERE c.cinema_id = $1
     GROUP BY c.cinema_id, c.cinema_name, c.city, c.address`,
        [cinemaId]
      );

      if (result.rowCount === 0) {
        throw createHttpError(404, "Cinema not found", "CINEMA_NOT_FOUND");
      }

      const row = result.rows[0];

      return {
        cinema_id: row.cinema_id,
        cinema_name: row.cinema_name,
        city: row.city,
        address: row.address,
        status: Number(row.total_tickets || 0) > 0 ? "active" : "inactive",
        lat: null,
        lng: null,
        is_mock_location: true,
        total_studios: Number(row.total_studios || 0),
        total_schedules: Number(row.total_schedules || 0),
        total_tickets: Number(row.total_tickets || 0)
      };
    }
  );
}

// Menghitung performa satu bioskop pada rentang tanggal tertentu untuk halaman drill-down.
export async function getCinemaPerformance(cinemaId, { start_date = null, end_date = null } = {}) {
  return withCache(
    "cinema-performance-v2",
    { cinemaId, start_date, end_date },
    config.cacheTtlSeconds,
    async () => {
      const rows = await getCinemaBreakdownRows({
        cinema_id: cinemaId,
        start_date,
        end_date
      });

      if (rows.length === 0) {
        throw createHttpError(404, "Cinema not found", "CINEMA_NOT_FOUND");
      }

      const row = rows[0];

      return {
        metrics: row.metrics,
        top_movie: row.top_movie,
        top_genre: row.top_genre,
        active_studios: row.metrics.active_studios
      };
    }
  );
}

// Mengembalikan ringkasan agregat per bioskop tanpa metadata master yang terlalu besar.
export async function getCinemaStats({
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null,
  start_date = null,
  end_date = null
} = {}) {
  return withCache(
    "stats-cinema-v4",
    { city, cinema_id, studio_id, movie_id, start_date, end_date },
    config.cacheTtlSeconds,
    async () => {
      const rows = await getCinemaBreakdownRows({
        city,
        cinema_id,
        studio_id,
        movie_id,
        start_date,
        end_date
      });

      const summary = rows.reduce(
        (accumulator, row) => ({
          total_cinemas: accumulator.total_cinemas + 1,
          active_cinemas: accumulator.active_cinemas + (row.metrics.total_tickets > 0 ? 1 : 0),
          total_tickets: accumulator.total_tickets + Number(row.metrics.total_tickets || 0),
          total_revenue: accumulator.total_revenue + Number(row.metrics.total_revenue || 0)
        }),
        {
          total_cinemas: 0,
          active_cinemas: 0,
          total_tickets: 0,
          total_revenue: 0
        }
      );

      const activeMovies = rows.reduce((max, row) => Math.max(max, Number(row.metrics.active_movies || 0)), 0);

      return {
        summary: {
          total_cinemas: summary.total_cinemas,
          active_cinemas: summary.active_cinemas,
          total_tickets: summary.total_tickets,
          total_revenue: Number(summary.total_revenue.toFixed(2)),
          active_movies: activeMovies
        },
        breakdown: rows.map((row) => ({
          cinema_id: row.cinema_id,
          cinema_name: row.cinema_name,
          city: row.city,
          metrics: row.metrics,
          top_movie: row.top_movie,
          top_genre: row.top_genre
        }))
      };
    }
  );
}
