import { query } from "../db.js";
import { resolveDateRange, formatDateOnly, resolveOptionalDateRange } from "../utils/date.js";
import { validateFilters } from "../utils/validation.js";
import { createHttpError } from "../utils/http-error.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";

// Menyusun filter SQL statistik agar query tetap ringkas dan konsisten.
function buildStatsFilters({ city, cinemaId, studioId }, startIndex = 3) {
  const filters = [];
  const values = [];

  if (city != null) {
    values.push(city);
    filters.push(`c.city = $${startIndex + values.length - 1}`);
  }

  if (cinemaId != null) {
    values.push(cinemaId);
    filters.push(`st.cinema_id = $${startIndex + values.length - 1}`);
  }

  if (studioId != null) {
    values.push(studioId);
    filters.push(`s.studio_id = $${startIndex + values.length - 1}`);
  }

  return { filters, values };
}

// Menghitung persen pertumbuhan current vs previous dengan hasil dua desimal.
function percentageGrowth(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
}

// Menghasilkan KPI utama dashboard beserta metadata periode dan filter yang aktif.
export async function getSummary({
  start_date,
  end_date,
  period = "daily",
  city = null,
  cinema_id = null,
  studio_id = null,
  compare = true
}) {
  const { startDate, endDate } = resolveDateRange(start_date, end_date, period);

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "stats-summary-v3",
    { start_date, end_date, period, city, cinema_id, studio_id, compare: String(compare), occupancy_mode: "avg_schedule" },
    config.cacheTtlSeconds,
    async () => {
      const runQuery = async (start, end) => {
        const { filters, values } = buildStatsFilters({
          city,
          cinemaId: cinema_id,
          studioId: studio_id
        }, 5);

        const extraFilterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
        const scheduleStartDate = formatDateOnly(start);
        const scheduleEndDate = formatDateOnly(end);
        const params = [scheduleStartDate, scheduleEndDate, start, end, ...values];

        const result = await query(
          `WITH schedule_stats AS (
          SELECT
            s.schedule_id,
            st.total_capacity,
            COUNT(t.tiket_id)::int AS tickets,
            CASE
              WHEN st.total_capacity > 0
                THEN COUNT(t.tiket_id)::float8 / st.total_capacity::float8
              ELSE 0
            END AS schedule_occupancy
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          LEFT JOIN tiket t ON t.schedule_id = s.schedule_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)${extraFilterSql}
          GROUP BY s.schedule_id, st.total_capacity
        ),
        occupancy_agg AS (
          SELECT
            COALESCE(SUM(tickets), 0)::float8 AS total_tickets_for_occupancy,
            COALESCE(SUM(total_capacity), 0)::float8 AS total_capacity,
            COALESCE(AVG(schedule_occupancy), 0)::float8 AS avg_schedule_occupancy
          FROM schedule_stats
        ),
        ticket_agg AS (
          SELECT
            COUNT(t.tiket_id)::int AS total_tickets,
            COALESCE(SUM(CAST(t.final_price AS NUMERIC)), 0)::numeric AS revenue,
            COUNT(DISTINCT s.schedule_id)::int AS total_transactions,
            COUNT(DISTINCT c.cinema_id)::int AS cinema_aktif
          FROM tiket t
          JOIN schedules s ON t.schedule_id = s.schedule_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $3 AND $4${extraFilterSql}
        )
        SELECT
          ta.total_tickets,
          ta.revenue,
          ta.total_transactions,
          ta.cinema_aktif,
          oa.total_tickets_for_occupancy,
          oa.total_capacity,
          oa.avg_schedule_occupancy
        FROM ticket_agg ta
        CROSS JOIN occupancy_agg oa`,
          params
        );

        const row = result.rows[0] || {};

        return {
          total_tickets: Number(row.total_tickets || 0),
          total_capacity: Number(row.total_capacity || 0),
          revenue: Number(row.revenue || 0),
          avg_occupancy: Number((Number(row.avg_schedule_occupancy || 0) * 100).toFixed(2)),
          total_transactions: Number(row.total_transactions || 0),
          cinema_aktif: Number(row.cinema_aktif || 0)
        };
      };

      const current = await runQuery(startDate, endDate);
      const totalCinemaResult = await query("SELECT COUNT(*)::int AS total FROM cinema");
      current.cinema_tersedia = Number(totalCinemaResult.rows[0]?.total || 0);

      let growth = {};

      if (String(compare) === "true" || compare === true) {
        const diff = endDate.getTime() - startDate.getTime();
        const previousEnd = new Date(startDate.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - diff);
        const previous = await runQuery(previousStart, previousEnd);

        growth = {
          tickets: percentageGrowth(current.total_tickets, previous.total_tickets),
          revenue: percentageGrowth(current.revenue, previous.revenue),
          avg_occupancy: percentageGrowth(current.avg_occupancy, previous.avg_occupancy)
        };
      }

      return {
        data: {
          ...current,
          growth
        },
        meta: {
          period: `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
          filters: {
            city,
            cinema_id,
            studio_id
          },
          scope: city || cinema_id || studio_id ? "filtered" : "global",
          compare: String(compare) === "true" || compare === true
        }
      };
    }
  );
}

// Mengelompokkan tren tiket dan revenue berdasarkan jam atau tanggal untuk chart frontend.
export async function getTrends({
  start_date,
  end_date,
  group_by = "hourly",
  city = null,
  cinema_id = null,
  movie_id = null,
  studio_id = null
}) {
  const { startDate, endDate } = resolveDateRange(start_date, end_date, "daily");
  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const buildTrendFilters = (params) => {
    const filters = [];

    if (city != null) {
      params.push(city);
      filters.push(`c.city = $${params.length}`);
    }

    if (cinema_id != null) {
      params.push(cinema_id);
      filters.push(`st.cinema_id = $${params.length}`);
    }

    if (movie_id != null) {
      params.push(movie_id);
      filters.push(`s.movie_id = $${params.length}`);
    }

    if (studio_id != null) {
      params.push(studio_id);
      filters.push(`s.studio_id = $${params.length}`);
    }

    return filters;
  };

  const timeExpression =
    group_by === "hourly"
      ? "EXTRACT(HOUR FROM t.trans_time::timestamp)"
      : group_by === "daily"
        ? "DATE(t.trans_time::timestamp)"
        : null;

  if (!timeExpression) {
    throw createHttpError(400, "Invalid Group By");
  }

  return withCache(
    "stats-trends-v2",
    { start_date, end_date, group_by, city, cinema_id, movie_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const runTrendQuery = async (rangeStart, rangeEnd) => {
        const params = [rangeStart, rangeEnd];
        const filters = buildTrendFilters(params);

        const result = await query(
          `SELECT
          ${timeExpression} AS time_group,
          COUNT(t.tiket_id)::int AS tickets_sold,
          COALESCE(SUM(CAST(t.final_price AS NUMERIC)), 0)::numeric AS revenue
       FROM tiket t
       JOIN schedules s ON t.schedule_id = s.schedule_id
       JOIN studio st ON s.studio_id = st.studio_id
       JOIN cinema c ON st.cinema_id = c.cinema_id
       WHERE t.trans_time::timestamp BETWEEN $1 AND $2
       ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
       GROUP BY time_group
       ORDER BY time_group`,
          params
        );

        return result.rows.map((row) => ({
          time_group: row.time_group,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: Number(row.revenue || 0)
        }));
      };

      const breakdown = await runTrendQuery(startDate, endDate);
      const currentTotals = breakdown.reduce(
        (accumulator, item) => ({
          total_tickets: accumulator.total_tickets + item.tickets_sold,
          revenue: accumulator.revenue + item.revenue
        }),
        { total_tickets: 0, revenue: 0 }
      );

      const diff = endDate.getTime() - startDate.getTime();
      const previousEnd = new Date(startDate.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - diff);
      const previousBreakdown = await runTrendQuery(previousStart, previousEnd);
      const previousTotals = previousBreakdown.reduce(
        (accumulator, item) => ({
          total_tickets: accumulator.total_tickets + item.tickets_sold,
          revenue: accumulator.revenue + item.revenue
        }),
        { total_tickets: 0, revenue: 0 }
      );

      return {
        summary: {
          group_by,
          total_tickets: currentTotals.total_tickets,
          revenue: Number(currentTotals.revenue.toFixed(2)),
          growth: {
            tickets: percentageGrowth(currentTotals.total_tickets, previousTotals.total_tickets),
            revenue: percentageGrowth(currentTotals.revenue, previousTotals.revenue)
          }
        },
        breakdown: breakdown.map((item) => ({
          time_group: item.time_group,
          tickets_sold: item.tickets_sold,
          revenue: Number(item.revenue.toFixed(2))
        }))
      };
    }
  );
}

// Menghitung okupansi kursi per grup waktu agar frontend bisa membuat chart kapasitas.
export async function getOccupancy({
  start_date,
  end_date,
  group_by = "hourly",
  cinema_id = null,
  studio_id = null,
  movie_id = null,
  city = null
}) {
  const { startDate, endDate } = resolveDateRange(start_date, end_date, "daily");
  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const params = [formatDateOnly(startDate), formatDateOnly(endDate)];
  const filters = [];

  if (city) {
    params.push(city);
    filters.push(`c.city = $${params.length}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    filters.push(`st.cinema_id = $${params.length}`);
  }

  if (studio_id) {
    params.push(studio_id);
    filters.push(`s.studio_id = $${params.length}`);
  }

  if (movie_id) {
    params.push(movie_id);
    filters.push(`s.movie_id = $${params.length}`);
  }

  const groupExpression =
    group_by === "hourly"
      ? "TO_CHAR(CAST(s.show_date AS DATE) + CAST(s.start_time AS TIME), 'YYYY-MM-DD HH24:00')"
      : "CAST(s.show_date AS DATE)";

  return withCache(
    "stats-occupancy-v3",
    { start_date, end_date, group_by, cinema_id, studio_id, movie_id, city },
    config.cacheTtlSeconds,
    async () => {
      const result = await query(
        `WITH per_schedule AS (
        SELECT
          s.schedule_id,
          ${groupExpression} AS time_group,
          st.total_capacity,
          COALESCE(COUNT(t.tiket_id), 0)::int AS total_tickets,
          CASE
            WHEN st.total_capacity > 0
              THEN COALESCE(COUNT(t.tiket_id), 0)::float8 / st.total_capacity::float8
            ELSE 0
          END AS schedule_occupancy
        FROM schedules s
        JOIN studio st ON s.studio_id = st.studio_id
        JOIN cinema c ON st.cinema_id = c.cinema_id
        LEFT JOIN tiket t ON t.schedule_id = s.schedule_id
        WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)
        ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
        GROUP BY s.schedule_id, time_group, st.total_capacity
      ),
      grouped_occupancy AS (
        SELECT
          time_group,
          SUM(total_tickets)::int AS total_tickets,
          SUM(total_capacity)::int AS total_capacity,
          COUNT(schedule_id)::int AS total_schedules,
          AVG(schedule_occupancy)::float8 AS avg_occupancy
        FROM per_schedule
        GROUP BY time_group
      )
      SELECT
        time_group,
        total_tickets,
        total_capacity,
        total_schedules,
        avg_occupancy AS occupancy
      FROM grouped_occupancy
      ORDER BY time_group`,
        params
      );

      const breakdown = result.rows.map((row) => ({
        time_group: row.time_group,
        total_tickets: Number(row.total_tickets || 0),
        total_capacity: Number(row.total_capacity || 0),
        total_schedules: Number(row.total_schedules || 0),
        occupancy: Number((Number(row.occupancy || 0) * 100).toFixed(2))
      }));

      const totals = breakdown.reduce(
        (accumulator, item) => ({
          total_tickets: accumulator.total_tickets + item.total_tickets,
          total_capacity: accumulator.total_capacity + item.total_capacity,
          total_schedules: accumulator.total_schedules + item.total_schedules,
          weighted_occupancy: accumulator.weighted_occupancy + (item.occupancy * item.total_schedules)
        }),
        { total_tickets: 0, total_capacity: 0, total_schedules: 0, weighted_occupancy: 0 }
      );

      return {
        summary: {
          group_by,
          total_tickets: totals.total_tickets,
          total_capacity: totals.total_capacity,
          occupancy:
            totals.total_schedules > 0
              ? Number((totals.weighted_occupancy / totals.total_schedules).toFixed(2))
              : 0
        },
        breakdown: breakdown.map(({ total_schedules, ...item }) => item)
      };
    }
  );
}

// Menggabungkan ringkasan performa film dan breakdown rating usia berdasarkan filter aktif.
export async function getMovieStats({
  city = null,
  cinema_id = null,
  studio_id = null,
  rating_usia = null,
  start_date = null,
  end_date = null
}) {
  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "stats-movie-v2",
    { city, cinema_id, studio_id, rating_usia, start_date, end_date },
    config.cacheTtlSeconds,
    async () => {
      const dateRange = resolveOptionalDateRange(start_date, end_date);
      const buildMovieFilters = (movieAlias = "m", studioAlias = "st", cinemaAlias = "c") => {
        const params = [];
        const filters = [];

        if (city) {
          params.push(city);
          filters.push(`${cinemaAlias}.city = $${params.length}`);
        }

        if (cinema_id) {
          params.push(cinema_id);
          filters.push(`${studioAlias}.cinema_id = $${params.length}`);
        }

        if (rating_usia) {
          params.push(rating_usia);
          filters.push(`${movieAlias}.rating_usia = $${params.length}`);
        }

        if (studio_id) {
          params.push(studio_id);
          filters.push(`${studioAlias}.studio_id = $${params.length}`);
        }

        if (dateRange) {
          params.push(start_date, end_date);
          filters.push(`CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`);
        }

        return {
          params,
          whereClause: filters.length ? `WHERE ${filters.join(" AND ")}` : ""
        };
      };

      const summaryFilters = buildMovieFilters();
      const summaryResult = await query(
        `SELECT COUNT(DISTINCT m.movie_id)::int AS total_movies_showing
     FROM movies m
     JOIN schedules s ON m.movie_id = s.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     ${summaryFilters.whereClause}`,
        summaryFilters.params
      );

      const ticketsFilters = buildMovieFilters();
      const ticketsResult = await query(
        `SELECT COUNT(t.tiket_id)::int AS total_tickets_sold
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN movies m ON s.movie_id = m.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     ${ticketsFilters.whereClause}`,
        ticketsFilters.params
      );

      const topMovieFilters = buildMovieFilters();
      const topMovieResult = await query(
        `SELECT
        m.movie_id,
        m.title,
        COUNT(t.tiket_id)::int AS tickets_sold
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN movies m ON s.movie_id = m.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     ${topMovieFilters.whereClause}
     GROUP BY m.movie_id, m.title
     ORDER BY COUNT(t.tiket_id) DESC, m.title ASC
     LIMIT 1`,
        topMovieFilters.params
      );

      const topGenreFilters = buildMovieFilters();
      const topGenreResult = await query(
        `SELECT
        TRIM(genre_item) AS genre,
        COUNT(t.tiket_id)::int AS tickets_sold
     FROM tiket t
     JOIN schedules s ON t.schedule_id = s.schedule_id
     JOIN movies m ON s.movie_id = m.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     CROSS JOIN LATERAL unnest(string_to_array(COALESCE(m.genre, ''), ',')) AS genre_item
     ${topGenreFilters.whereClause ? `${topGenreFilters.whereClause} AND TRIM(genre_item) <> ''` : "WHERE TRIM(genre_item) <> ''"}
     GROUP BY TRIM(genre_item)
     ORDER BY COUNT(t.tiket_id) DESC, TRIM(genre_item) ASC
     LIMIT 1`,
        topGenreFilters.params
      );

      const ratingFilters = buildMovieFilters();
      const ratingResult = await query(
        `SELECT
        COALESCE(m.rating_usia, 'Unknown') AS rating_usia,
        COUNT(t.tiket_id)::int AS total_tickets_sold,
        COUNT(DISTINCT s.schedule_id)::int AS total_showings
     FROM movies m
     JOIN schedules s ON m.movie_id = s.movie_id
     JOIN studio st ON s.studio_id = st.studio_id
     JOIN cinema c ON st.cinema_id = c.cinema_id
     LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
     ${ratingFilters.whereClause}
     GROUP BY COALESCE(m.rating_usia, 'Unknown')
     ORDER BY COALESCE(m.rating_usia, 'Unknown')`,
        ratingFilters.params
      );

      const summaryRow = summaryResult.rows[0] || {};
      const ticketsRow = ticketsResult.rows[0] || {};
      const topMovieRow = topMovieResult.rows[0] || {};
      const topGenreRow = topGenreResult.rows[0] || {};

      return {
        summary: {
          total_movies_showing: Number(summaryRow.total_movies_showing || 0),
          total_tickets_sold: Number(ticketsRow.total_tickets_sold || 0),
          top_movie: topMovieRow.title
            ? {
                movie_id: topMovieRow.movie_id,
                title: topMovieRow.title,
                tickets_sold: Number(topMovieRow.tickets_sold || 0)
              }
            : null,
          top_genre: topGenreRow.genre
            ? {
                genre: topGenreRow.genre,
                tickets_sold: Number(topGenreRow.tickets_sold || 0)
              }
            : null
        },
        breakdown_rating_usia: ratingResult.rows.map((row) => ({
          rating_usia: row.rating_usia,
          total_tickets_sold: Number(row.total_tickets_sold || 0),
          total_showings: Number(row.total_showings || 0)
        }))
      };
    }
  );
}

// Membuat prediksi harian sederhana berbasis pola weekday dari beberapa minggu terakhir.
export async function getForecast({
  start_date = null,
  end_date = null,
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null,
  days_ahead = 7,
  lookback_weeks = 4
} = {}) {
  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const parsedDaysAhead = Math.max(1, Number(days_ahead || 7));
  const parsedLookbackWeeks = Math.max(1, Number(lookback_weeks || 4));
  const now = new Date();
  const defaultForecastStart = new Date(now);
  defaultForecastStart.setDate(defaultForecastStart.getDate() + 1);
  defaultForecastStart.setHours(0, 0, 0, 0);
  const defaultForecastEnd = new Date(defaultForecastStart);
  defaultForecastEnd.setDate(defaultForecastEnd.getDate() + parsedDaysAhead - 1);
  defaultForecastEnd.setHours(23, 59, 59, 999);

  const forecastWindow =
    start_date && end_date
      ? resolveDateRange(start_date, end_date, "daily")
      : {
          startDate: defaultForecastStart,
          endDate: defaultForecastEnd
        };

  const historyEnd = new Date(forecastWindow.startDate.getTime() - 1);
  const historyStart = new Date(historyEnd);
  historyStart.setDate(historyStart.getDate() - (parsedLookbackWeeks * 7) + 1);
  historyStart.setHours(0, 0, 0, 0);

  const buildForecastFilters = (params, aliases = { cinema: "c", studio: "st", schedule: "s" }) => {
    const filters = [];

    if (city) {
      params.push(city);
      filters.push(`${aliases.cinema}.city = $${params.length}`);
    }

    if (cinema_id) {
      params.push(cinema_id);
      filters.push(`${aliases.studio}.cinema_id = $${params.length}`);
    }

    if (studio_id) {
      params.push(studio_id);
      filters.push(`${aliases.schedule}.studio_id = $${params.length}`);
    }

    if (movie_id) {
      params.push(movie_id);
      filters.push(`${aliases.schedule}.movie_id = $${params.length}`);
    }

    return filters;
  };

  return withCache(
    "stats-forecast-v1",
    {
      start_date,
      end_date,
      city,
      cinema_id,
      studio_id,
      movie_id,
      days_ahead: String(parsedDaysAhead),
      lookback_weeks: String(parsedLookbackWeeks)
    },
    config.cacheTtlSeconds,
    async () => {
      const salesParams = [historyStart, historyEnd];
      const salesFilters = buildForecastFilters(salesParams);
      const salesResult = await query(
        `SELECT
          DATE(t.trans_time::timestamp) AS metric_date,
          EXTRACT(DOW FROM DATE(t.trans_time::timestamp))::int AS weekday_number,
          COUNT(t.tiket_id)::int AS total_tickets,
          COALESCE(SUM(CAST(t.final_price AS NUMERIC)), 0)::numeric AS revenue
        FROM tiket t
        JOIN schedules s ON t.schedule_id = s.schedule_id
        JOIN studio st ON s.studio_id = st.studio_id
        JOIN cinema c ON st.cinema_id = c.cinema_id
        WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $1 AND $2
        ${salesFilters.length ? `AND ${salesFilters.join(" AND ")}` : ""}
        GROUP BY DATE(t.trans_time::timestamp)
        ORDER BY DATE(t.trans_time::timestamp)`,
        salesParams
      );

      const occupancyParams = [formatDateOnly(historyStart), formatDateOnly(historyEnd)];
      const occupancyFilters = buildForecastFilters(occupancyParams);
      const occupancyResult = await query(
        `WITH per_schedule AS (
          SELECT
            CAST(s.show_date AS DATE) AS metric_date,
            EXTRACT(DOW FROM CAST(s.show_date AS DATE))::int AS weekday_number,
            CASE
              WHEN st.total_capacity > 0
                THEN COUNT(t.tiket_id)::float8 / st.total_capacity::float8
              ELSE 0
            END AS schedule_occupancy
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON t.schedule_id = s.schedule_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)
          ${occupancyFilters.length ? `AND ${occupancyFilters.join(" AND ")}` : ""}
          GROUP BY CAST(s.show_date AS DATE), weekday_number, s.schedule_id, st.total_capacity
        )
        SELECT
          metric_date,
          weekday_number,
          AVG(schedule_occupancy)::float8 AS avg_occupancy
        FROM per_schedule
        GROUP BY metric_date, weekday_number
        ORDER BY metric_date`,
        occupancyParams
      );

      const buildWeekdayMap = (rows, valueSelector) => {
        const weekdayMap = new Map();

        for (const row of rows) {
          const weekday = Number(row.weekday_number || 0);
          const bucket = weekdayMap.get(weekday) || [];
          bucket.push(valueSelector(row));
          weekdayMap.set(weekday, bucket);
        }

        return weekdayMap;
      };

      const average = (values) =>
        values.length > 0
          ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length
          : 0;

      const salesTicketMap = buildWeekdayMap(salesResult.rows, (row) => Number(row.total_tickets || 0));
      const salesRevenueMap = buildWeekdayMap(salesResult.rows, (row) => Number(row.revenue || 0));
      const occupancyMap = buildWeekdayMap(occupancyResult.rows, (row) => Number(row.avg_occupancy || 0) * 100);

      const fallbackTickets = average(salesResult.rows.map((row) => Number(row.total_tickets || 0)));
      const fallbackRevenue = average(salesResult.rows.map((row) => Number(row.revenue || 0)));
      const fallbackOccupancy = average(occupancyResult.rows.map((row) => Number(row.avg_occupancy || 0) * 100));

      const breakdown = [];
      const cursor = new Date(forecastWindow.startDate);
      const forecastEndDate = new Date(forecastWindow.endDate);
      forecastEndDate.setHours(0, 0, 0, 0);

      while (cursor <= forecastEndDate) {
        const weekday = cursor.getDay();
        const ticketSamples = salesTicketMap.get(weekday) || [];
        const revenueSamples = salesRevenueMap.get(weekday) || [];
        const occupancySamples = occupancyMap.get(weekday) || [];

        breakdown.push({
          forecast_date: formatDateOnly(cursor),
          weekday_number: weekday,
          weekday_label: cursor.toLocaleDateString("en-US", { weekday: "long" }),
          predicted_tickets: Number((average(ticketSamples.length ? ticketSamples : [fallbackTickets])).toFixed(2)),
          predicted_revenue: Number((average(revenueSamples.length ? revenueSamples : [fallbackRevenue])).toFixed(2)),
          predicted_occupancy: Number((average(occupancySamples.length ? occupancySamples : [fallbackOccupancy])).toFixed(2)),
          sample_size: Math.max(ticketSamples.length, revenueSamples.length, occupancySamples.length)
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      const summary = breakdown.reduce(
        (accumulator, item) => ({
          predicted_tickets: accumulator.predicted_tickets + item.predicted_tickets,
          predicted_revenue: accumulator.predicted_revenue + item.predicted_revenue,
          predicted_occupancy: accumulator.predicted_occupancy + item.predicted_occupancy
        }),
        {
          predicted_tickets: 0,
          predicted_revenue: 0,
          predicted_occupancy: 0
        }
      );

      return {
        summary: {
          predicted_tickets: Number(summary.predicted_tickets.toFixed(2)),
          predicted_revenue: Number(summary.predicted_revenue.toFixed(2)),
          predicted_avg_occupancy:
            breakdown.length > 0
              ? Number((summary.predicted_occupancy / breakdown.length).toFixed(2))
              : 0,
          forecast_days: breakdown.length,
          lookback_weeks: parsedLookbackWeeks
        },
        breakdown,
        meta: {
          history_window: {
            start_date: formatDateOnly(historyStart),
            end_date: formatDateOnly(historyEnd)
          },
          forecast_window: {
            start_date: formatDateOnly(forecastWindow.startDate),
            end_date: formatDateOnly(forecastWindow.endDate)
          }
        }
      };
    }
  );
}
