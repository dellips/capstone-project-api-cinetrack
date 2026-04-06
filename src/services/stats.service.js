import { query } from "../db.js";
import { resolveDateRange, formatDateOnly } from "../utils/date.js";
import { buildResponse } from "../utils/response.js";
import { validateFilters } from "../utils/validation.js";
import { createHttpError } from "../utils/http-error.js";

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

function percentageGrowth(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export async function getSummary({
  start_date,
  end_date,
  period = "daily",
  city = null,
  cinema_id = null,
  studio_id = null,
  compare = false
}) {
  const { startDate, endDate } = resolveDateRange(start_date, end_date, period);

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  const runQuery = async (start, end) => {
    const { filters, values } = buildStatsFilters({
      city,
      cinemaId: cinema_id,
      studioId: studio_id
    });

    const extraFilterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    const params = [start, end, ...values];

    const result = await query(
      `WITH schedule_stats AS (
          SELECT
            s.schedule_id,
            st.total_capacity,
            COUNT(t.tiket_id) AS tickets
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
            COALESCE(SUM(total_capacity), 0)::float8 AS total_capacity
          FROM schedule_stats
        ),
        ticket_agg AS (
          SELECT
            COUNT(t.tiket_id)::int AS total_tickets,
            COALESCE(SUM(t.final_price), 0)::float8 AS revenue,
            COUNT(DISTINCT s.schedule_id)::int AS total_transactions,
            COUNT(DISTINCT c.cinema_id)::int AS cinema_aktif
          FROM tiket t
          JOIN schedules s ON t.schedule_id = s.schedule_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(t.trans_time AS TIMESTAMP) BETWEEN $1 AND $2${extraFilterSql}
        )
        SELECT
          ta.total_tickets,
          ta.revenue,
          ta.total_transactions,
          ta.cinema_aktif,
          oa.total_tickets_for_occupancy,
          oa.total_capacity
        FROM ticket_agg ta
        CROSS JOIN occupancy_agg oa`,
      params
    );

    const row = result.rows[0] || {};

    return {
      total_tickets: Number(row.total_tickets || 0),
      revenue: Number(row.revenue || 0),
      occupancy:
        Number(row.total_capacity || 0) > 0
          ? Number(
              ((Number(row.total_tickets_for_occupancy || 0) * 100) / Number(row.total_capacity)).toFixed(2)
            )
          : 0,
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
    const previousStart = new Date(startDate.getTime() - diff);
    const previousEnd = new Date(startDate);
    const previous = await runQuery(previousStart, previousEnd);

    growth = {
      tickets: percentageGrowth(current.total_tickets, previous.total_tickets),
      revenue: percentageGrowth(current.revenue, previous.revenue),
      occupancy: percentageGrowth(current.occupancy, previous.occupancy)
    };
  }

  return buildResponse(
    {
      period: `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
      filters: {
        city,
        cinema_id,
        studio_id
      },
      scope: city || cinema_id || studio_id ? "filtered" : "global"
    },
    current,
    growth
  );
}

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

  const runTrendQuery = async (rangeStart, rangeEnd) => {
    const params = [rangeStart, rangeEnd];
    const filters = buildTrendFilters(params);

    const result = await query(
      `SELECT
          ${timeExpression} AS time_group,
          COUNT(t.tiket_id)::int AS tickets_sold,
          COALESCE(SUM(t.final_price), 0)::float8 AS revenue
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
  const previousStart = new Date(startDate.getTime() - diff);
  const previousEnd = new Date(startDate);
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

  const params = [startDate, endDate];
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

  const result = await query(
    `WITH per_schedule AS (
        SELECT
          s.schedule_id,
          ${groupExpression} AS time_group,
          st.total_capacity,
          COALESCE(COUNT(t.tiket_id), 0)::int AS total_tickets
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
          SUM(total_capacity)::int AS total_capacity
        FROM per_schedule
        GROUP BY time_group
      )
      SELECT
        time_group,
        total_tickets,
        total_capacity,
        CASE
          WHEN total_capacity > 0 THEN total_tickets::float8 / total_capacity
          ELSE 0
        END AS occupancy
      FROM grouped_occupancy
      ORDER BY time_group`,
    params
  );

  const breakdown = result.rows.map((row) => ({
    time_group: row.time_group,
    total_tickets: Number(row.total_tickets || 0),
    total_capacity: Number(row.total_capacity || 0),
    occupancy: Number((Number(row.occupancy || 0) * 100).toFixed(2))
  }));

  const totals = breakdown.reduce(
    (accumulator, item) => ({
      total_tickets: accumulator.total_tickets + item.total_tickets,
      total_capacity: accumulator.total_capacity + item.total_capacity
    }),
    { total_tickets: 0, total_capacity: 0 }
  );

  return {
    summary: {
      group_by,
      total_tickets: totals.total_tickets,
      total_capacity: totals.total_capacity,
      occupancy:
        totals.total_capacity > 0
          ? Number((((totals.total_tickets * 100) / totals.total_capacity)).toFixed(2))
          : 0
    },
    breakdown
  };
}

export async function getMovieStats({ city = null, cinema_id = null, rating_usia = null }) {
  await validateFilters({
    city,
    cinemaId: cinema_id
  });

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
    filters: {
      city,
      cinema_id,
      rating_usia
    },
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
