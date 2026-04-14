import { query } from "../db.js";
import { resolveDateRange, formatDateOnly, resolveOptionalDateRange } from "../utils/date.js";
import { validateFilters } from "../utils/validation.js";
import { createHttpError } from "../utils/http-error.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";

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
        }, 3);

        const extraFilterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
        const scheduleStartDate = formatDateOnly(start);
        const scheduleEndDate = formatDateOnly(end);
        const params = [scheduleStartDate, scheduleEndDate, ...values];

        const result = await query(
          `WITH filtered_schedules AS (
          SELECT
            s.schedule_id,
            st.total_capacity,
            st.cinema_id
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)${extraFilterSql}
        ),
        schedule_stats AS (
          SELECT
            fs.schedule_id,
            fs.total_capacity,
            COUNT(t.tiket_id)::int AS tickets,
            CASE
              WHEN fs.total_capacity > 0
                THEN COUNT(t.tiket_id)::float8 / fs.total_capacity::float8
              ELSE 0
            END AS schedule_occupancy
          FROM filtered_schedules fs
          LEFT JOIN tiket t ON t.schedule_id = fs.schedule_id
          GROUP BY fs.schedule_id, fs.total_capacity
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
            COUNT(DISTINCT fs.schedule_id)::int AS total_transactions,
            COUNT(DISTINCT fs.cinema_id)::int AS cinema_aktif
          FROM filtered_schedules fs
          LEFT JOIN tiket t ON t.schedule_id = fs.schedule_id
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

      let growth = {};
      let current = null;
      const totalCinemaPromise = query("SELECT COUNT(*)::int AS total FROM cinema");

      if (String(compare) === "true" || compare === true) {
        const diff = endDate.getTime() - startDate.getTime();
        const previousEnd = new Date(startDate.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - diff);
        const [currentResult, previous] = await Promise.all([
          runQuery(startDate, endDate),
          runQuery(previousStart, previousEnd)
        ]);
        current = currentResult;

        growth = {
          tickets: percentageGrowth(current.total_tickets, previous.total_tickets),
          revenue: percentageGrowth(current.revenue, previous.revenue),
          avg_occupancy: percentageGrowth(current.avg_occupancy, previous.avg_occupancy)
        };
      } else {
        current = await runQuery(startDate, endDate);
      }

      const totalCinemaResult = await totalCinemaPromise;
      current.cinema_tersedia = Number(totalCinemaResult.rows[0]?.total || 0);

      return {
        data: {
          ...current,
          growth
        },
        meta: {
          period: `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`,
          date_axis: "show_date",
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
      ? "EXTRACT(HOUR FROM CAST(s.start_time AS TIME))"
      : group_by === "daily"
        ? "CAST(s.show_date AS DATE)"
        : null;

  if (!timeExpression) {
    throw createHttpError(400, "Invalid Group By");
  }

  return withCache(
    "stats-trends-v3",
    { start_date, end_date, group_by, city, cinema_id, movie_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const runTrendQuery = async (rangeStart, rangeEnd) => {
        const params = [formatDateOnly(rangeStart), formatDateOnly(rangeEnd)];
        const filters = buildTrendFilters(params);

        const result = await query(
          `WITH filtered_schedules AS (
          SELECT
            s.schedule_id,
            s.start_time,
            s.show_date
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)
          ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
       )
       SELECT
          ${timeExpression.replaceAll("s.", "fs.")} AS time_group,
          COUNT(t.tiket_id)::int AS tickets_sold,
          COALESCE(SUM(CAST(t.final_price AS NUMERIC)), 0)::numeric AS revenue
       FROM filtered_schedules fs
       JOIN tiket t ON t.schedule_id = fs.schedule_id
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

      const diff = endDate.getTime() - startDate.getTime();
      const previousEnd = new Date(startDate.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - diff);
      const [breakdown, previousBreakdown] = await Promise.all([
        runTrendQuery(startDate, endDate),
        runTrendQuery(previousStart, previousEnd)
      ]);
      const currentTotals = breakdown.reduce(
        (accumulator, item) => ({
          total_tickets: accumulator.total_tickets + item.tickets_sold,
          revenue: accumulator.revenue + item.revenue
        }),
        { total_tickets: 0, revenue: 0 }
      );

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
          date_axis: "show_date",
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

export async function getMovieStats({
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null,
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
    "stats-movie-v3",
    { city, cinema_id, studio_id, movie_id, rating_usia, start_date, end_date },
    config.cacheTtlSeconds,
    async () => {
      const dateRange = resolveOptionalDateRange(start_date, end_date);
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
      if (movie_id) {
        params.push(movie_id);
        filters.push(`m.movie_id = $${params.length}`);
      }
      if (rating_usia) {
        params.push(rating_usia);
        filters.push(`m.rating_usia = $${params.length}`);
      }
      if (studio_id) {
        params.push(studio_id);
        filters.push(`st.studio_id = $${params.length}`);
      }
      if (dateRange) {
        params.push(formatDateOnly(dateRange.startDate), formatDateOnly(dateRange.endDate));
        filters.push(`CAST(s.show_date AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const result = await query(
        `WITH filtered AS (
          SELECT
            s.schedule_id,
            m.movie_id,
            m.title,
            COALESCE(m.rating_usia, 'Unknown') AS rating_usia,
            m.genre,
            t.tiket_id,
            LOWER(COALESCE(t.seat_category, '')) AS seat_category
          FROM schedules s
          JOIN movies m ON s.movie_id = m.movie_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          ${whereClause}
        ),
        summary AS (
          SELECT
            COUNT(DISTINCT movie_id)::int AS total_movies_showing,
            COUNT(tiket_id)::int AS total_tickets_sold
          FROM filtered
        ),
        top_movie AS (
          SELECT movie_id, title, COUNT(tiket_id)::int AS tickets_sold
          FROM filtered
          WHERE tiket_id IS NOT NULL
          GROUP BY movie_id, title
          ORDER BY COUNT(tiket_id) DESC, title ASC
          LIMIT 1
        ),
        top_genre AS (
          SELECT TRIM(genre_item) AS genre, COUNT(f.tiket_id)::int AS tickets_sold
          FROM filtered f
          CROSS JOIN LATERAL unnest(string_to_array(COALESCE(f.genre, ''), ',')) AS genre_item
          WHERE TRIM(genre_item) <> '' AND f.tiket_id IS NOT NULL
          GROUP BY TRIM(genre_item)
          ORDER BY COUNT(f.tiket_id) DESC, TRIM(genre_item) ASC
          LIMIT 1
        ),
        rating_breakdown AS (
          SELECT
            rating_usia,
            COUNT(tiket_id)::int AS total_tickets_sold,
            COUNT(DISTINCT schedule_id)::int AS total_showings,
            COUNT(CASE WHEN seat_category = 'regular' THEN 1 END)::int AS regular_seats,
            COUNT(CASE WHEN seat_category = 'vip' THEN 1 END)::int AS vip_seats,
            COUNT(CASE WHEN seat_category = 'sweetbox' THEN 1 END)::int AS sweetbox_seats
          FROM filtered
          GROUP BY rating_usia
          ORDER BY rating_usia
        )
        SELECT
          s.total_movies_showing,
          s.total_tickets_sold,
          (
            SELECT json_build_object('movie_id', tm.movie_id, 'title', tm.title, 'tickets_sold', tm.tickets_sold)
            FROM top_movie tm
          ) AS top_movie,
          (
            SELECT json_build_object('genre', tg.genre, 'tickets_sold', tg.tickets_sold)
            FROM top_genre tg
          ) AS top_genre,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'rating_usia', rb.rating_usia,
                  'total_tickets_sold', rb.total_tickets_sold,
                  'total_showings', rb.total_showings,
                  'seat_distribution', json_build_object(
                    'Regular', rb.regular_seats,
                    'VIP', rb.vip_seats,
                    'Sweetbox', rb.sweetbox_seats
                  )
                )
              )
              FROM rating_breakdown rb
            ),
            '[]'::json
          ) AS breakdown_rating_usia
        FROM summary s`,
        params
      );

      const row = result.rows[0] || {};
      return {
        summary: {
          total_movies_showing: Number(row.total_movies_showing || 0),
          total_tickets_sold: Number(row.total_tickets_sold || 0),
          top_movie: row.top_movie || null,
          top_genre: row.top_genre || null
        },
        breakdown_rating_usia: row.breakdown_rating_usia || []
      };
    }
  );
}

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
