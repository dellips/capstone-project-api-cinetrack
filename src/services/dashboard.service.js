import { query } from "../db.js";
import { resolveDateRange, formatDateOnly } from "../utils/date.js";
import { validateFilters } from "../utils/validation.js";
import { withCache } from "../utils/cache.js";
import { config } from "../config.js";
import { getSystemHealth } from "./system.service.js";
import { getAlertsSummary, getNotifications } from "./notifications.service.js";
import { getSummary, getOccupancy, getMovieStats } from "./stats.service.js";
import { getCinemaStats } from "./cinemas.service.js";
import { getMoviesBySales } from "./base.service.js";

const MOCK_PAYMENT_FEES = {
  cash: 0,
  debit_card: 1500,
  credit_card: 2500,
  qris: 1000,
  ewallet: 1500,
  unknown: 1000
};

// Membulatkan angka desimal agar payload analytics tetap rapi dan ringan.
function roundNumber(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

// Mengisi fallback admin fee bila payment config asli belum tersedia di database.
function getMockAdminFee(paymentType) {
  const normalized = String(paymentType || "unknown").toLowerCase().replace(/\s+/g, "_");
  return MOCK_PAYMENT_FEES[normalized] ?? MOCK_PAYMENT_FEES.unknown;
}

// Menambahkan filter scope umum agar query dashboard tetap konsisten di semua endpoint.
function buildScopeFilters(
  { city = null, cinema_id = null, studio_id = null, movie_id = null, payment_type = null } = {},
  aliases = { cinema: "c", studio: "st", schedule: "s", ticket: "t" },
  startIndex = 1
) {
  const params = [];
  const conditions = [];
  const placeholder = () => `$${startIndex + params.length - 1}`;

  if (city) {
    params.push(city);
    conditions.push(`${aliases.cinema}.city = ${placeholder()}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    conditions.push(`${aliases.studio}.cinema_id = ${placeholder()}`);
  }

  if (studio_id) {
    params.push(studio_id);
    conditions.push(`${aliases.schedule}.studio_id = ${placeholder()}`);
  }

  if (movie_id) {
    params.push(movie_id);
    conditions.push(`${aliases.schedule}.movie_id = ${placeholder()}`);
  }

  if (payment_type) {
    params.push(payment_type);
    conditions.push(`${aliases.ticket}.payment_type = ${placeholder()}`);
  }

  return {
    params,
    conditions
  };
}

// Menambahkan filter tanggal ke query berdasarkan kolom tanggal atau timestamp yang dipakai.
function appendDateFilter(params, conditions, startDate, endDate, column, type = "timestamp") {
  if (!startDate || !endDate) {
    return;
  }

  if (type === "date") {
    params.push(formatDateOnly(startDate), formatDateOnly(endDate));
    conditions.push(`CAST(${column} AS DATE) BETWEEN CAST($${params.length - 1} AS DATE) AND CAST($${params.length} AS DATE)`);
    return;
  }

  params.push(startDate.toISOString(), endDate.toISOString());
  conditions.push(`CAST(${column} AS TIMESTAMP) BETWEEN $${params.length - 1} AND $${params.length}`);
}

// Mengubah notifikasi internal menjadi kontrak dashboard yang lebih kaya konteks.
function mapDashboardNotification(item) {
  const where =
    item.context?.cinema_name
    || item.context?.cinema_id
    || item.context?.city
    || "network";

  const impactSize =
    item.context?.growth
    ?? item.context?.occupancy
    ?? item.context?.tickets_last_hour
    ?? item.context?.active_cinemas
    ?? 0;

  const recommendationById = {
    "system-health": "Cek konektivitas backend, database, dan sinkronisasi data.",
    "revenue-growth": "Review promo, lineup film, dan cabang dengan penurunan revenue.",
    "occupancy-level": "Pertimbangkan relayout studio atau kurangi show yang sepi.",
    "cinema-activity": "Validasi cabang tanpa aktivitas apakah offline, maintenance, atau idle."
  };

  return {
    type: item.notification_id,
    severity: item.severity,
    title: item.title,
    what_happened: item.message,
    where,
    impact_size: impactSize,
    recommended_action: recommendationById[item.notification_id] || "Tinjau metrik terkait dan lakukan evaluasi operasional.",
    created_at: item.created_at,
    status: item.status,
    resolved: item.status === "read"
  };
}

// Menghitung moving average sederhana untuk membantu frontend menampilkan trend yang lebih halus.
function buildMovingAverageSeries(breakdown, windowSize = 3) {
  return breakdown.map((item, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    const windowItems = breakdown.slice(startIndex, index + 1);
    const movingAverage =
      windowItems.reduce((total, current) => total + Number(current.revenue || 0), 0) / windowItems.length;

    return {
      ...item,
      moving_average: roundNumber(movingAverage)
    };
  });
}

// Menghasilkan forecast sederhana sebagai fallback sebelum model prediksi khusus tersedia.
function buildForecast(breakdown, group_by) {
  if (breakdown.length === 0) {
    return {
      group_by,
      next_period: null,
      projected_revenue: 0,
      is_mock_forecast: true
    };
  }

  const lastItems = breakdown.slice(-3);
  const projectedRevenue =
    lastItems.reduce((total, item) => total + Number(item.revenue || 0), 0) / lastItems.length;

  return {
    group_by,
    next_period: "next_period",
    projected_revenue: roundNumber(projectedRevenue),
    is_mock_forecast: true
  };
}

// Menghitung label rekomendasi sederhana berdasarkan gap demand dan monetisasi per slot.
function buildTimeSlotRecommendation(item) {
  if (item.optimization_score >= 0.6 && item.occupancy >= 70) {
    return "Pertimbangkan premium pricing atau tambah show pada slot ini.";
  }

  if (item.optimization_score >= 0.5) {
    return "Demand bagus, evaluasi harga dan alokasi studio agar monetisasi naik.";
  }

  if (item.occupancy < 40) {
    return "Slot cenderung sepi, pertimbangkan promo atau kurangi frekuensi tayang.";
  }

  return "Pertahankan slot ini sambil memantau perubahan demand.";
}

// Mengambil ringkasan revenue per kota untuk executive dashboard dan heatmap wilayah.
async function getCityRevenueRows(filters, dateRange) {
  const scope = buildScopeFilters(filters);
  appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
  const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

  const result = await query(
    `WITH per_schedule AS (
      SELECT
        c.city,
        c.cinema_id,
        s.schedule_id,
        st.total_capacity,
        COUNT(t.tiket_id)::int AS total_tickets,
        COALESCE(SUM(t.final_price), 0)::float8 AS total_revenue
      FROM schedules s
      JOIN studio st ON s.studio_id = st.studio_id
      JOIN cinema c ON st.cinema_id = c.cinema_id
      LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
      ${whereClause}
      GROUP BY c.city, c.cinema_id, s.schedule_id, st.total_capacity
    )
    SELECT
      city,
      COUNT(DISTINCT cinema_id)::int AS total_cinemas,
      SUM(total_tickets)::int AS total_tickets,
      SUM(total_revenue)::float8 AS total_revenue,
      SUM(total_capacity)::int AS total_capacity,
      COUNT(schedule_id)::int AS total_shows
    FROM per_schedule
    GROUP BY city
    ORDER BY SUM(total_revenue) DESC, SUM(total_tickets) DESC, city ASC`,
    scope.params
  );

  return result.rows.map((row) => ({
    city: row.city,
    total_cinemas: Number(row.total_cinemas || 0),
    total_tickets: Number(row.total_tickets || 0),
    total_revenue: Number(row.total_revenue || 0),
    total_capacity: Number(row.total_capacity || 0),
    total_shows: Number(row.total_shows || 0),
    avg_occupancy:
      Number(row.total_capacity || 0) > 0
        ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
        : 0,
    lat: null,
    lng: null,
    is_mock_location: true
  }));
}

// Merangkum node status per cinema dengan inferensi dari aktivitas tiket dan health backend.
export async function getSystemStatus() {
  return withCache("system-status", {}, config.cacheTtlSeconds, async () => {
    const [health, cinemaStats] = await Promise.all([
      getSystemHealth(),
      getCinemaStats({})
    ]);

    const nodes = cinemaStats.breakdown.map((item) => ({
      cinema_id: item.cinema_id,
      cinema_name: item.cinema_name,
      city: item.city,
      status: health.status !== "active"
        ? "down"
        : item.metrics.total_tickets > 0
          ? "active"
          : "inactive",
      heartbeat_at: health.last_data_in,
      last_sync: health.last_data_in,
      is_mock_node_status: true
    }));

    const activeNodes = nodes.filter((item) => item.status === "active").length;
    const downNodes = nodes.filter((item) => item.status === "down").length;

    return {
      system: health,
      summary: {
        total_nodes: nodes.length,
        active_nodes: activeNodes,
        inactive_nodes: nodes.length - activeNodes - downNodes,
        down_nodes: downNodes,
        health_rate: nodes.length > 0 ? roundNumber((activeNodes * 100) / nodes.length) : 0
      },
      nodes
    };
  });
}

// Mengembalikan daftar kota unik sebagai sumber map dan filter lokasi frontend.
export async function getCities() {
  return withCache("cities-list", {}, config.cacheTtlSeconds, async () => {
    const result = await query(
      `SELECT
        city,
        COUNT(*)::int AS total_cinemas
      FROM cinema
      GROUP BY city
      ORDER BY city`
    );

    return result.rows.map((row) => ({
      city: row.city,
      total_cinemas: Number(row.total_cinemas || 0),
      lat: null,
      lng: null,
      is_mock_location: true
    }));
  });
}

// Menyediakan konfigurasi payment mock agar analitik profitability bisa tetap hidup.
export async function getPaymentConfigs() {
  return withCache("payments-config", {}, config.cacheTtlSeconds, async () => {
    const result = await query(
      `SELECT DISTINCT COALESCE(payment_type, 'unknown') AS payment_type
      FROM tiket
      ORDER BY COALESCE(payment_type, 'unknown')`
    );

    return result.rows.map((row) => ({
      payment_type: row.payment_type,
      admin_fee: getMockAdminFee(row.payment_type),
      success_rate: 100,
      failure_rate: 0,
      is_mock_config: true
    }));
  });
}

// Menggabungkan KPI utama executive dashboard agar frontend cukup memanggil satu endpoint.
export async function getExecutiveDashboard({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-executive",
    { start_date, end_date, city, cinema_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const [systemStatus, alerts, cinemaStats, topMovies, cityRevenueRows] = await Promise.all([
        getSystemStatus(),
        getAlertsSummary(),
        getCinemaStats({ city, cinema_id, start_date, end_date }),
        getMoviesBySales({ city, cinema_id, start_date, end_date, top10: true }),
        getCityRevenueRows({ city, cinema_id, studio_id }, dateRange)
      ]);

      const totalMovieRevenue = topMovies.reduce((total, item) => total + Number(item.revenue || 0), 0);

      return {
        system_status: {
          status: systemStatus.system.status,
          last_update: systemStatus.system.last_data_in,
          health_rate: systemStatus.summary.health_rate
        },
        active_vs_inactive_cinema: {
          total: systemStatus.summary.total_nodes,
          active: systemStatus.summary.active_nodes,
          inactive: systemStatus.summary.inactive_nodes,
          maintenance: 0,
          down: systemStatus.summary.down_nodes,
          is_mock_maintenance: true
        },
        franchise_performance: cinemaStats.breakdown,
        city_revenue_summary: cityRevenueRows,
        top_film_contribution: topMovies.map((item) => ({
          movie_id: item.movie_id,
          title: item.title,
          total_tickets: item.tickets_sold,
          total_revenue: item.revenue,
          revenue_share:
            totalMovieRevenue > 0
              ? roundNumber((Number(item.revenue || 0) * 100) / totalMovieRevenue)
              : 0
        })),
        alert_summary: alerts
      };
    }
  );
}

// Menghasilkan overview sales supaya kartu KPI frontend tidak menghitung ulang dari raw data.
export async function getSalesOverview({
  start_date,
  end_date,
  period = "daily",
  city = null,
  cinema_id = null,
  studio_id = null
} = {}) {
  return withCache(
    "dashboard-sales-overview",
    { start_date, end_date, period, city, cinema_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const summary = await getSummary({
        start_date,
        end_date,
        period,
        city,
        cinema_id,
        studio_id,
        compare: true
      });

      const data = summary.data;
      const avgTicketPrice =
        data.total_tickets > 0 ? roundNumber(data.revenue / data.total_tickets) : 0;
      const revenuePerSeat =
        data.total_capacity > 0 ? roundNumber(data.revenue / data.total_capacity) : 0;

      return {
        total_revenue: roundNumber(data.revenue),
        total_tickets: data.total_tickets,
        avg_ticket_price: avgTicketPrice,
        revenue_per_seat: revenuePerSeat,
        avg_occupancy: data.avg_occupancy,
        growth: data.growth || {}
      };
    }
  );
}

// Menyediakan ranking dan kontribusi revenue per cinema untuk halaman sales.
export async function getSalesRevenueByCinema({
  start_date,
  end_date,
  city = null,
  cinema_id = null
} = {}) {
  return withCache(
    "dashboard-sales-revenue-by-cinema",
    { start_date, end_date, city, cinema_id },
    config.cacheTtlSeconds,
    async () => {
      const cinemaStats = await getCinemaStats({ start_date, end_date, city, cinema_id });
      const totalRevenue = cinemaStats.breakdown.reduce(
        (total, item) => total + Number(item.metrics.total_revenue || 0),
        0
      );

      const breakdown = [...cinemaStats.breakdown]
        .sort((left, right) => right.metrics.total_revenue - left.metrics.total_revenue)
        .map((item, index) => ({
          rank: index + 1,
          cinema_id: item.cinema_id,
          cinema_name: item.cinema_name,
          city: item.city,
          total_revenue: roundNumber(item.metrics.total_revenue),
          total_tickets: item.metrics.total_tickets,
          contribution:
            totalRevenue > 0
              ? roundNumber((Number(item.metrics.total_revenue || 0) * 100) / totalRevenue)
              : 0,
          top_movie: item.top_movie
        }));

      return {
        summary: cinemaStats.summary,
        top_performing_cinema: breakdown[0] || null,
        lowest_performing_cinema: breakdown[breakdown.length - 1] || null,
        breakdown
      };
    }
  );
}

// Menyediakan ranking revenue per film berikut kontribusinya ke total penjualan.
export async function getSalesRevenueByMovie({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  top_n = 10
} = {}) {
  return withCache(
    "dashboard-sales-revenue-by-movie",
    { start_date, end_date, city, cinema_id, top_n },
    config.cacheTtlSeconds,
    async () => {
      const movies = await getMoviesBySales({ start_date, end_date, city, cinema_id });
      const ranked = [...movies].sort((left, right) => right.revenue - left.revenue);
      const totalRevenue = ranked.reduce((total, item) => total + Number(item.revenue || 0), 0);

      const breakdown = ranked.slice(0, Number(top_n || 10)).map((item, index) => ({
        rank: index + 1,
        movie_id: item.movie_id,
        title: item.title,
        total_revenue: roundNumber(item.revenue),
        total_tickets: item.tickets_sold,
        contribution:
          totalRevenue > 0 ? roundNumber((Number(item.revenue || 0) * 100) / totalRevenue) : 0
      }));

      return {
        total_movies: ranked.length,
        top_movie: breakdown[0] || null,
        breakdown
      };
    }
  );
}

// Mengelompokkan demand, revenue, dan okupansi per slot jam untuk optimasi sales.
export async function getSalesTimeSlots({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-sales-time-slots",
    { start_date, end_date, city, cinema_id, studio_id, movie_id },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
      const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

      const result = await query(
        `WITH slot_stats AS (
          SELECT
            LPAD(EXTRACT(HOUR FROM CAST(s.start_time AS TIME))::int::text, 2, '0') || ':00' AS time_slot,
            s.schedule_id,
            st.total_capacity,
            COUNT(t.tiket_id)::int AS demand,
            COALESCE(SUM(t.final_price), 0)::float8 AS revenue
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          ${whereClause}
          GROUP BY time_slot, s.schedule_id, st.total_capacity
        )
        SELECT
          time_slot,
          SUM(demand)::int AS demand,
          SUM(revenue)::float8 AS revenue,
          SUM(total_capacity)::int AS total_capacity
        FROM slot_stats
        GROUP BY time_slot
        ORDER BY time_slot`,
        scope.params
      );

      const rawRows = result.rows.map((row) => ({
        time_slot: row.time_slot,
        demand: Number(row.demand || 0),
        revenue: Number(row.revenue || 0),
        total_capacity: Number(row.total_capacity || 0)
      }));

      const maxDemand = Math.max(...rawRows.map((item) => item.demand), 0);
      const minDemand = Math.min(...rawRows.map((item) => item.demand), maxDemand);
      const maxRevenue = Math.max(...rawRows.map((item) => item.revenue), 0);
      const minRevenue = Math.min(...rawRows.map((item) => item.revenue), maxRevenue);

      const breakdown = rawRows.map((item) => {
        const normalizedDemand =
          maxDemand === minDemand ? (item.demand > 0 ? 1 : 0) : (item.demand - minDemand) / (maxDemand - minDemand);
        const normalizedRevenue =
          maxRevenue === minRevenue ? (item.revenue > 0 ? 1 : 0) : (item.revenue - minRevenue) / (maxRevenue - minRevenue);
        const optimizationScore = roundNumber((normalizedDemand * 0.6) - (normalizedRevenue * 0.4));
        const occupancy =
          item.total_capacity > 0 ? roundNumber((item.demand * 100) / item.total_capacity) : 0;

        return {
          time_slot: item.time_slot,
          revenue: roundNumber(item.revenue),
          demand: item.demand,
          occupancy,
          normalized_demand: roundNumber(normalizedDemand),
          normalized_revenue: roundNumber(normalizedRevenue),
          optimization_score: optimizationScore,
          recommendation: buildTimeSlotRecommendation({
            optimization_score: optimizationScore,
            occupancy
          })
        };
      });

      return {
        peak_sales_hour: breakdown.reduce((best, item) => (!best || item.revenue > best.revenue ? item : best), null),
        quiet_hour: breakdown.reduce((best, item) => (!best || item.revenue < best.revenue ? item : best), null),
        breakdown
      };
    }
  );
}

// Menyediakan trend revenue/tiket dengan moving average dan forecast sederhana.
export async function getSalesTrend({
  start_date,
  end_date,
  group_by = "daily",
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-sales-trend",
    { start_date, end_date, group_by, city, cinema_id, studio_id, movie_id },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "t.trans_time", "timestamp");
      const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";
      const timeGroup =
        group_by === "monthly"
          ? "TO_CHAR(DATE_TRUNC('month', t.trans_time::timestamp), 'YYYY-MM')"
          : "TO_CHAR(DATE(t.trans_time::timestamp), 'YYYY-MM-DD')";

      const result = await query(
        `SELECT
          ${timeGroup} AS time_group,
          COUNT(t.tiket_id)::int AS total_tickets,
          COALESCE(SUM(t.final_price), 0)::float8 AS revenue
        FROM tiket t
        JOIN schedules s ON t.schedule_id = s.schedule_id
        JOIN studio st ON s.studio_id = st.studio_id
        JOIN cinema c ON st.cinema_id = c.cinema_id
        ${whereClause}
        GROUP BY time_group
        ORDER BY time_group`,
        scope.params
      );

      const breakdown = buildMovingAverageSeries(
        result.rows.map((row) => ({
          time_group: row.time_group,
          total_tickets: Number(row.total_tickets || 0),
          revenue: roundNumber(row.revenue)
        }))
      );

      const currentRevenue = breakdown.reduce((total, item) => total + Number(item.revenue || 0), 0);
      const currentTickets = breakdown.reduce((total, item) => total + Number(item.total_tickets || 0), 0);

      return {
        summary: {
          group_by,
          total_revenue: roundNumber(currentRevenue),
          total_tickets: currentTickets
        },
        forecast: buildForecast(breakdown, group_by),
        breakdown
      };
    }
  );
}

// Menghitung preferensi metode bayar dan profitabilitas bersih dengan config mock.
export async function getSalesPayment({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  payment_type = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-sales-payment",
    { start_date, end_date, city, cinema_id, studio_id, payment_type },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id, payment_type });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "t.trans_time", "timestamp");
      const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT
          COALESCE(t.payment_type, 'unknown') AS payment_type,
          COUNT(t.tiket_id)::int AS total_transactions,
          COALESCE(SUM(t.final_price), 0)::float8 AS gross_revenue,
          COALESCE(AVG(t.final_price), 0)::float8 AS avg_price
        FROM tiket t
        JOIN schedules s ON t.schedule_id = s.schedule_id
        JOIN studio st ON s.studio_id = st.studio_id
        JOIN cinema c ON st.cinema_id = c.cinema_id
        ${whereClause}
        GROUP BY COALESCE(t.payment_type, 'unknown')
        ORDER BY COUNT(t.tiket_id) DESC, COALESCE(t.payment_type, 'unknown') ASC`,
        scope.params
      );

      const totalTransactions = result.rows.reduce(
        (total, row) => total + Number(row.total_transactions || 0),
        0
      );

      const breakdown = result.rows.map((row) => {
        const adminFee = getMockAdminFee(row.payment_type);
        const transactionCount = Number(row.total_transactions || 0);
        const grossRevenue = Number(row.gross_revenue || 0);

        return {
          payment_type: row.payment_type,
          total_transactions: transactionCount,
          usage_rate: totalTransactions > 0 ? roundNumber((transactionCount * 100) / totalTransactions) : 0,
          gross_revenue: roundNumber(grossRevenue),
          avg_price: roundNumber(row.avg_price),
          admin_fee: adminFee,
          success_rate: 100,
          failure_rate: 0,
          net_profitability: roundNumber(grossRevenue - (transactionCount * adminFee)),
          is_mock_config: true
        };
      });

      return {
        total_transactions: totalTransactions,
        preferred_payment: breakdown[0] || null,
        breakdown
      };
    }
  );
}

// Merangkum cancelled dan delayed show agar risiko operasional mudah dipantau.
export async function getSalesOperationalRisk({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-sales-operational-risk",
    { start_date, end_date, city, cinema_id, studio_id, movie_id },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id }, undefined, 3);
      const whereClause = scope.conditions.length ? `AND ${scope.conditions.join(" AND ")}` : "";

      const [summaryResult, listResult] = await Promise.all([
        query(
          `SELECT
            COUNT(s.schedule_id)::int AS total_shows,
            COUNT(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('cancelled', 'canceled') THEN 1 END)::int AS cancelled_shows,
            COUNT(CASE WHEN LOWER(COALESCE(s.status, '')) = 'delayed' THEN 1 END)::int AS delayed_shows
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)
          ${whereClause}`,
          [formatDateOnly(dateRange.startDate), formatDateOnly(dateRange.endDate), ...scope.params]
        ),
        query(
          `SELECT
            s.schedule_id,
            s.movie_id,
            m.title,
            st.studio_id,
            c.cinema_id,
            c.cinema_name,
            c.city,
            s.show_date,
            s.start_time,
            s.status,
            COUNT(t.tiket_id)::int AS tickets_sold,
            COALESCE(SUM(t.final_price), 0)::float8 AS revenue
          FROM schedules s
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN movies m ON s.movie_id = m.movie_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          WHERE CAST(s.show_date AS DATE) BETWEEN CAST($1 AS DATE) AND CAST($2 AS DATE)
            AND LOWER(COALESCE(s.status, '')) IN ('cancelled', 'canceled', 'delayed')
            ${whereClause}
          GROUP BY
            s.schedule_id,
            s.movie_id,
            m.title,
            st.studio_id,
            c.cinema_id,
            c.cinema_name,
            c.city,
            s.show_date,
            s.start_time,
            s.status
          ORDER BY CAST(s.show_date AS DATE) DESC, CAST(s.start_time AS TIME) DESC`,
          [formatDateOnly(dateRange.startDate), formatDateOnly(dateRange.endDate), ...scope.params]
        )
      ]);

      const summaryRow = summaryResult.rows[0] || {};
      const totalShows = Number(summaryRow.total_shows || 0);
      const cancelledShows = Number(summaryRow.cancelled_shows || 0);
      const delayedShows = Number(summaryRow.delayed_shows || 0);

      return {
        summary: {
          total_shows: totalShows,
          cancelled: cancelledShows,
          delayed: delayedShows,
          avg_delay_minutes: null,
          problematic_rate: totalShows > 0 ? roundNumber(((cancelledShows + delayedShows) * 100) / totalShows) : 0,
          is_mock_delay: true
        },
        problematic_schedules: listResult.rows.map((row) => ({
          schedule_id: row.schedule_id,
          movie_id: row.movie_id,
          title: row.title,
          studio_id: row.studio_id,
          cinema_id: row.cinema_id,
          cinema_name: row.cinema_name,
          city: row.city,
          show_date: row.show_date,
          start_time: row.start_time,
          status: row.status,
          delay_minutes: null,
          tickets_sold: Number(row.tickets_sold || 0),
          revenue: roundNumber(row.revenue),
          is_mock_delay: true
        }))
      };
    }
  );
}

// Menghasilkan ringkasan utama halaman films dari sisi inventory dan penjualan.
export async function getFilmsOverview({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null
} = {}) {
  return withCache(
    "dashboard-films-overview",
    { start_date, end_date, city, cinema_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const [movieStats, occupancy, summary, scheduleResult] = await Promise.all([
        getMovieStats({ start_date, end_date, city, cinema_id }),
        getOccupancy({ start_date, end_date, city, cinema_id, studio_id, group_by: "daily" }),
        getSummary({ start_date, end_date, city, cinema_id, studio_id, compare: true }),
        (async () => {
          const dateRange = resolveDateRange(start_date, end_date, "daily");
          const scope = buildScopeFilters({ city, cinema_id, studio_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT COUNT(DISTINCT s.schedule_id)::int AS total_shows
            FROM schedules s
            JOIN studio st ON s.studio_id = st.studio_id
            JOIN cinema c ON st.cinema_id = c.cinema_id
            ${whereClause}`,
            scope.params
          );
        })()
      ]);

      return {
        active_films: movieStats.summary.total_movies_showing,
        total_shows: Number(scheduleResult.rows[0]?.total_shows || 0),
        tickets_sold: summary.data.total_tickets,
        revenue: roundNumber(summary.data.revenue),
        avg_occupancy: occupancy.summary.occupancy,
        growth: summary.data.growth || {}
      };
    }
  );
}

// Menyajikan performa film beserta ranking blockbuster berbasis tiket dan revenue.
export async function getFilmsPerformance({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  top_n = 10
} = {}) {
  return withCache(
    "dashboard-films-performance",
    { start_date, end_date, city, cinema_id, top_n },
    config.cacheTtlSeconds,
    async () => {
      const movies = await getMoviesBySales({ start_date, end_date, city, cinema_id });

      const breakdown = [...movies]
        .sort((left, right) => {
          if (right.tickets_sold !== left.tickets_sold) {
            return right.tickets_sold - left.tickets_sold;
          }

          return right.revenue - left.revenue;
        })
        .slice(0, Number(top_n || 10))
        .map((item, index) => ({
          rank: index + 1,
          movie_id: item.movie_id,
          title: item.title,
          total_tickets: item.tickets_sold,
          total_revenue: roundNumber(item.revenue),
          blockbuster_score: roundNumber((item.tickets_sold * 0.6) + (Number(item.revenue || 0) * 0.4))
        }));

      return {
        top_movie: breakdown[0] || null,
        breakdown
      };
    }
  );
}

// Menggabungkan performa tiap schedule dengan ringkasan repeat show dan audience density.
export async function getFilmsSchedules({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-films-schedules",
    { start_date, end_date, city, cinema_id, studio_id, movie_id },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
      const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

      const [scheduleResult, repeatResult, densityResult] = await Promise.all([
        query(
          `SELECT
            s.schedule_id,
            s.movie_id,
            m.title,
            s.show_date,
            s.start_time,
            st.studio_id,
            st.cinema_id,
            st.total_capacity,
            COUNT(t.tiket_id)::int AS total_tickets,
            COALESCE(SUM(t.final_price), 0)::float8 AS revenue
          FROM schedules s
          JOIN movies m ON s.movie_id = m.movie_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          ${whereClause}
          GROUP BY
            s.schedule_id,
            s.movie_id,
            m.title,
            s.show_date,
            s.start_time,
            st.studio_id,
            st.cinema_id,
            st.total_capacity
          ORDER BY CAST(s.show_date AS DATE) DESC, CAST(s.start_time AS TIME) DESC`,
          scope.params
        ),
        query(
          `SELECT
            s.movie_id,
            m.title,
            s.show_date,
            COUNT(DISTINCT s.schedule_id)::int AS total_schedules,
            COUNT(t.tiket_id)::int AS total_tickets,
            COALESCE(SUM(t.final_price), 0)::float8 AS revenue
          FROM schedules s
          JOIN movies m ON s.movie_id = m.movie_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          ${whereClause}
          GROUP BY s.movie_id, m.title, s.show_date
          ORDER BY CAST(s.show_date AS DATE) DESC, m.title ASC`,
          scope.params
        ),
        query(
          `SELECT
            s.movie_id,
            m.title,
            COUNT(DISTINCT s.schedule_id)::int AS total_schedules,
            COUNT(t.tiket_id)::int AS total_tickets,
            SUM(st.total_capacity)::int AS total_capacity
          FROM schedules s
          JOIN movies m ON s.movie_id = m.movie_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
          ${whereClause}
          GROUP BY s.movie_id, m.title
          ORDER BY COUNT(t.tiket_id) DESC, m.title ASC`,
          scope.params
        )
      ]);

      return {
        schedule_performance: scheduleResult.rows.map((row) => ({
          schedule_id: row.schedule_id,
          movie_id: row.movie_id,
          title: row.title,
          show_date: row.show_date,
          start_time: row.start_time,
          studio_id: row.studio_id,
          cinema_id: row.cinema_id,
          total_tickets: Number(row.total_tickets || 0),
          revenue: roundNumber(row.revenue),
          occupancy:
            Number(row.total_capacity || 0) > 0
              ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
              : 0
        })),
        repeat_schedule_performance: repeatResult.rows.map((row) => ({
          movie_id: row.movie_id,
          title: row.title,
          show_date: row.show_date,
          total_schedules: Number(row.total_schedules || 0),
          total_tickets: Number(row.total_tickets || 0),
          revenue: roundNumber(row.revenue)
        })),
        audience_density: densityResult.rows.map((row) => ({
          movie_id: row.movie_id,
          title: row.title,
          total_schedules: Number(row.total_schedules || 0),
          total_tickets: Number(row.total_tickets || 0),
          audience_density:
            Number(row.total_schedules || 0) > 0
              ? roundNumber(Number(row.total_tickets || 0) / Number(row.total_schedules || 0))
              : 0,
          capacity_utilization:
            Number(row.total_capacity || 0) > 0
              ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
              : 0
        }))
      };
    }
  );
}

// Mengembalikan okupansi film secara global dan dalam beberapa breakdown penting.
export async function getFilmsOccupancy({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  movie_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-films-occupancy",
    { start_date, end_date, city, cinema_id, studio_id, movie_id },
    config.cacheTtlSeconds,
    async () => {
      const [overall, movieBreakdownResult, dayBreakdownResult, studioBreakdownResult] = await Promise.all([
        getOccupancy({ start_date, end_date, city, cinema_id, studio_id, movie_id, group_by: "daily" }),
        (async () => {
          const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT
              s.movie_id,
              m.title,
              COUNT(t.tiket_id)::int AS total_tickets,
              SUM(st.total_capacity)::int AS total_capacity
            FROM schedules s
            JOIN movies m ON s.movie_id = m.movie_id
            JOIN studio st ON s.studio_id = st.studio_id
            JOIN cinema c ON st.cinema_id = c.cinema_id
            LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
            ${whereClause}
            GROUP BY s.movie_id, m.title
            ORDER BY COUNT(t.tiket_id) DESC, m.title ASC`,
            scope.params
          );
        })(),
        (async () => {
          const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT
              s.show_date,
              COUNT(t.tiket_id)::int AS total_tickets,
              SUM(st.total_capacity)::int AS total_capacity
            FROM schedules s
            JOIN studio st ON s.studio_id = st.studio_id
            JOIN cinema c ON st.cinema_id = c.cinema_id
            LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
            ${whereClause}
            GROUP BY s.show_date
            ORDER BY CAST(s.show_date AS DATE)`,
            scope.params
          );
        })(),
        (async () => {
          const scope = buildScopeFilters({ city, cinema_id, studio_id, movie_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT
              st.studio_id,
              st.studio_name,
              COUNT(t.tiket_id)::int AS total_tickets,
              SUM(st.total_capacity)::int AS total_capacity
            FROM schedules s
            JOIN studio st ON s.studio_id = st.studio_id
            JOIN cinema c ON st.cinema_id = c.cinema_id
            LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
            ${whereClause}
            GROUP BY st.studio_id, st.studio_name
            ORDER BY COUNT(t.tiket_id) DESC, st.studio_name ASC`,
            scope.params
          );
        })()
      ]);

      const averageOccupancy = Number(overall.summary.occupancy || 0);
      const movieBreakdown = movieBreakdownResult.rows.map((row) => {
        const occupancy =
          Number(row.total_capacity || 0) > 0
            ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
            : 0;

        return {
          movie_id: row.movie_id,
          title: row.title,
          total_tickets: Number(row.total_tickets || 0),
          total_capacity: Number(row.total_capacity || 0),
          occupancy,
          capacity_fit: occupancy,
          underperforming_score: averageOccupancy > 0 ? roundNumber(occupancy / averageOccupancy) : 0,
          status:
            averageOccupancy > 0 && (occupancy / averageOccupancy) < 0.5
              ? "critical"
              : averageOccupancy > 0 && (occupancy / averageOccupancy) < 0.7
                ? "underperforming"
                : "good"
        };
      });

      return {
        overall: overall.summary,
        by_movie: movieBreakdown,
        by_day: dayBreakdownResult.rows.map((row) => ({
          show_date: row.show_date,
          total_tickets: Number(row.total_tickets || 0),
          total_capacity: Number(row.total_capacity || 0),
          occupancy:
            Number(row.total_capacity || 0) > 0
              ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
              : 0
        })),
        by_studio: studioBreakdownResult.rows.map((row) => ({
          studio_id: row.studio_id,
          studio_name: row.studio_name,
          total_tickets: Number(row.total_tickets || 0),
          total_capacity: Number(row.total_capacity || 0),
          occupancy:
            Number(row.total_capacity || 0) > 0
              ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
              : 0
        }))
      };
    }
  );
}

// Menggabungkan distribusi genre dan format studio agar evaluasi lineup lebih mudah.
export async function getFilmsDistribution({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "dashboard-films-distribution",
    { start_date, end_date, city, cinema_id, studio_id },
    config.cacheTtlSeconds,
    async () => {
      const [movieStats, genreResult, studioFormatResult] = await Promise.all([
        getMovieStats({ start_date, end_date, city, cinema_id }),
        (async () => {
          const scope = buildScopeFilters({ city, cinema_id, studio_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT
              TRIM(genre_item) AS genre,
              COUNT(t.tiket_id)::int AS total_tickets
            FROM schedules s
            JOIN movies m ON s.movie_id = m.movie_id
            JOIN studio st ON s.studio_id = st.studio_id
            JOIN cinema c ON st.cinema_id = c.cinema_id
            LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
            CROSS JOIN LATERAL unnest(string_to_array(COALESCE(m.genre, ''), ',')) AS genre_item
            ${whereClause ? `${whereClause} AND TRIM(genre_item) <> ''` : "WHERE TRIM(genre_item) <> ''"}
            GROUP BY TRIM(genre_item)
            ORDER BY COUNT(t.tiket_id) DESC, TRIM(genre_item) ASC`,
            scope.params
          );
        })(),
        (async () => {
          const scope = buildScopeFilters({ city, cinema_id, studio_id });
          appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
          const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

          return query(
            `SELECT
              COALESCE(st.screen_type::text, 'unknown') AS screen_type,
              COUNT(DISTINCT st.studio_id)::int AS total_studios,
              COUNT(DISTINCT s.schedule_id)::int AS total_schedules
            FROM studio st
            LEFT JOIN schedules s ON st.studio_id = s.studio_id
            LEFT JOIN cinema c ON st.cinema_id = c.cinema_id
            ${whereClause}
            GROUP BY COALESCE(st.screen_type::text, 'unknown')
            ORDER BY COUNT(DISTINCT st.studio_id) DESC, COALESCE(st.screen_type::text, 'unknown') ASC`,
            scope.params
          );
        })()
      ]);

      return {
        genre_popularity: {
          summary: movieStats.summary,
          breakdown: genreResult.rows.map((row) => ({
            genre: row.genre,
            total_tickets: Number(row.total_tickets || 0)
          })),
          breakdown_rating_usia: movieStats.breakdown_rating_usia
        },
        studio_format_distribution: studioFormatResult.rows.map((row) => ({
          format: row.screen_type,
          type: row.screen_type,
          total_studios: Number(row.total_studios || 0),
          total_schedules: Number(row.total_schedules || 0)
        }))
      };
    }
  );
}

// Menyajikan risiko operasional film agar issue show bisa ditindak dari halaman films.
export async function getFilmsOperationalRisk(filters = {}) {
  const risk = await getSalesOperationalRisk(filters);

  const impactedMovies = new Map();

  for (const item of risk.problematic_schedules) {
    const current = impactedMovies.get(item.movie_id) || {
      movie_id: item.movie_id,
      title: item.title,
      cancelled: 0,
      delayed: 0,
      impacted_revenue: 0
    };

    if (String(item.status || "").toLowerCase().includes("cancel")) {
      current.cancelled += 1;
    }

    if (String(item.status || "").toLowerCase() === "delayed") {
      current.delayed += 1;
    }

    current.impacted_revenue += Number(item.revenue || 0);
    impactedMovies.set(item.movie_id, current);
  }

  return {
    summary: risk.summary,
    impacted_movies: Array.from(impactedMovies.values()).map((item) => ({
      ...item,
      impacted_revenue: roundNumber(item.impacted_revenue)
    })),
    problematic_schedules: risk.problematic_schedules
  };
}

// Mengemas notifikasi dashboard dalam kontrak yang lebih mudah dipakai halaman alert center.
export async function getDashboardNotifications({ status = "all", severity = null, page = 1, limit = 20 } = {}) {
  return withCache(
    "dashboard-notifications",
    { status, severity, page: String(page), limit: String(limit) },
    config.cacheTtlSeconds,
    async () => {
      const result = await getNotifications({ status, severity, page, limit });

      return {
        data: result.data.map(mapDashboardNotification),
        meta: result.meta
      };
    }
  );
}

// Mengubah hasil slot menjadi rekomendasi pricing yang siap dipakai dashboard atau tim bisnis.
export async function getPricingRecommendations(filters = {}) {
  return withCache(
    "analytics-pricing-recommendation",
    {
      ...filters,
      top_n: String(filters.top_n || 10)
    },
    config.cacheTtlSeconds,
    async () => {
      const slotData = await getSalesTimeSlots(filters);
      const prioritized = slotData.breakdown
        .filter((item) => item.demand > 0)
        .map((item) => {
          let action = "hold";
          let reason = "Slot ini relatif seimbang.";
          let price_change_pct = 0;

          if (item.normalized_demand >= 0.7 && item.normalized_revenue <= 0.45 && item.occupancy >= 70) {
            action = "increase_price";
            reason = "Demand dan okupansi tinggi, tetapi monetisasi slot masih tertinggal.";
            price_change_pct = 8;
          } else if (item.normalized_demand >= 0.6 && item.occupancy >= 80) {
            action = "increase_price";
            reason = "Slot sangat padat dan layak diuji premium pricing.";
            price_change_pct = 5;
          } else if (item.occupancy <= 35) {
            action = "discount_or_reduce_slot";
            reason = "Okupansi rendah, lebih cocok didorong promo atau dikurangi frekuensinya.";
            price_change_pct = -10;
          }

          return {
            time_slot: item.time_slot,
            demand: item.demand,
            revenue: item.revenue,
            occupancy: item.occupancy,
            optimization_score: item.optimization_score,
            suggested_action: action,
            suggested_price_change_pct: price_change_pct,
            reason,
            confidence:
              action === "hold"
                ? 0.45
                : item.occupancy >= 70 || item.occupancy <= 35
                  ? 0.8
                  : 0.65,
            is_rule_based: true
          };
        })
        .sort((left, right) => Math.abs(right.suggested_price_change_pct) - Math.abs(left.suggested_price_change_pct));

      return {
        summary: {
          total_slots_analyzed: slotData.breakdown.length,
          recommended_changes: prioritized.filter((item) => item.suggested_action !== "hold").length,
          peak_sales_hour: slotData.peak_sales_hour,
          quiet_hour: slotData.quiet_hour,
          is_rule_based: true
        },
        recommendations: prioritized.slice(0, Number(filters.top_n || 10))
      };
    }
  );
}

// Mendeteksi film yang mulai melonjak lebih cepat dari periode sebelumnya.
export async function getEarlyBlockbuster({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  min_tickets = 100,
  min_growth = 25
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "analytics-early-blockbuster",
    {
      start_date,
      end_date,
      city,
      cinema_id,
      studio_id,
      min_tickets: String(min_tickets),
      min_growth: String(min_growth)
    },
    config.cacheTtlSeconds,
    async () => {
      const diff = dateRange.endDate.getTime() - dateRange.startDate.getTime();
      const previousEnd = new Date(dateRange.startDate.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - diff);
      const scope = buildScopeFilters({ city, cinema_id, studio_id });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "t.trans_time", "timestamp");
      const currentWhere = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

      const previousScope = buildScopeFilters({ city, cinema_id, studio_id });
      appendDateFilter(previousScope.params, previousScope.conditions, previousStart, previousEnd, "t.trans_time", "timestamp");
      const previousWhere = previousScope.conditions.length ? `WHERE ${previousScope.conditions.join(" AND ")}` : "";

      const [currentResult, previousResult] = await Promise.all([
        query(
          `SELECT
            s.movie_id,
            m.title,
            COUNT(t.tiket_id)::int AS total_tickets,
            COALESCE(SUM(t.final_price), 0)::float8 AS total_revenue
          FROM tiket t
          JOIN schedules s ON t.schedule_id = s.schedule_id
          JOIN movies m ON s.movie_id = m.movie_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          ${currentWhere}
          GROUP BY s.movie_id, m.title`,
          scope.params
        ),
        query(
          `SELECT
            s.movie_id,
            COUNT(t.tiket_id)::int AS total_tickets
          FROM tiket t
          JOIN schedules s ON t.schedule_id = s.schedule_id
          JOIN studio st ON s.studio_id = st.studio_id
          JOIN cinema c ON st.cinema_id = c.cinema_id
          ${previousWhere}
          GROUP BY s.movie_id`,
          previousScope.params
        )
      ]);

      const previousMap = new Map(
        previousResult.rows.map((row) => [row.movie_id, Number(row.total_tickets || 0)])
      );

      const breakdown = currentResult.rows
        .map((row) => {
          const currentTickets = Number(row.total_tickets || 0);
          const previousTickets = previousMap.get(row.movie_id) || 0;
          const growthRate =
            previousTickets === 0
              ? (currentTickets > 0 ? 100 : 0)
              : roundNumber(((currentTickets - previousTickets) * 100) / previousTickets);

          return {
            movie_id: row.movie_id,
            title: row.title,
            current_tickets: currentTickets,
            previous_tickets: previousTickets,
            growth_rate: growthRate,
            total_revenue: roundNumber(row.total_revenue),
            blockbuster_signal:
              currentTickets >= Number(min_tickets) && growthRate >= Number(min_growth),
            suggested_action:
              currentTickets >= Number(min_tickets) && growthRate >= Number(min_growth)
                ? "Tambah show dan dorong marketing lebih cepat."
                : "Pantau lebih lanjut sebelum ekspansi slot.",
            is_rule_based: true
          };
        })
        .sort((left, right) => {
          if (right.growth_rate !== left.growth_rate) {
            return right.growth_rate - left.growth_rate;
          }

          return right.current_tickets - left.current_tickets;
        });

      return {
        summary: {
          min_tickets: Number(min_tickets),
          min_growth: Number(min_growth),
          detected_movies: breakdown.filter((item) => item.blockbuster_signal).length,
          is_rule_based: true
        },
        breakdown
      };
    }
  );
}

// Mendeteksi film yang melemah pada slot yang sama ketika film lain jauh lebih kuat.
export async function getCannibalization({
  start_date,
  end_date,
  city = null,
  cinema_id = null,
  studio_id = null,
  min_competitor_occupancy = 70,
  max_impacted_occupancy = 40
} = {}) {
  const dateRange = resolveDateRange(start_date, end_date, "daily");

  await validateFilters({
    city,
    cinemaId: cinema_id,
    studioId: studio_id
  });

  return withCache(
    "analytics-cannibalization",
    {
      start_date,
      end_date,
      city,
      cinema_id,
      studio_id,
      min_competitor_occupancy: String(min_competitor_occupancy),
      max_impacted_occupancy: String(max_impacted_occupancy)
    },
    config.cacheTtlSeconds,
    async () => {
      const scope = buildScopeFilters({ city, cinema_id, studio_id });
      appendDateFilter(scope.params, scope.conditions, dateRange.startDate, dateRange.endDate, "s.show_date", "date");
      const whereClause = scope.conditions.length ? `WHERE ${scope.conditions.join(" AND ")}` : "";

      const result = await query(
        `SELECT
          c.cinema_id,
          c.cinema_name,
          c.city,
          s.show_date,
          LPAD(EXTRACT(HOUR FROM CAST(s.start_time AS TIME))::int::text, 2, '0') || ':00' AS time_slot,
          s.movie_id,
          m.title,
          COUNT(t.tiket_id)::int AS total_tickets,
          SUM(st.total_capacity)::int AS total_capacity
        FROM schedules s
        JOIN movies m ON s.movie_id = m.movie_id
        JOIN studio st ON s.studio_id = st.studio_id
        JOIN cinema c ON st.cinema_id = c.cinema_id
        LEFT JOIN tiket t ON s.schedule_id = t.schedule_id
        ${whereClause}
        GROUP BY
          c.cinema_id,
          c.cinema_name,
          c.city,
          s.show_date,
          time_slot,
          s.movie_id,
          m.title
        ORDER BY c.cinema_id, s.show_date, time_slot, m.title`,
        scope.params
      );

      const slotMap = new Map();

      for (const row of result.rows) {
        const occupancy =
          Number(row.total_capacity || 0) > 0
            ? roundNumber((Number(row.total_tickets || 0) * 100) / Number(row.total_capacity || 0))
            : 0;
        const key = `${row.cinema_id}|${row.show_date}|${row.time_slot}`;
        const items = slotMap.get(key) || [];

        items.push({
          cinema_id: row.cinema_id,
          cinema_name: row.cinema_name,
          city: row.city,
          show_date: row.show_date,
          time_slot: row.time_slot,
          movie_id: row.movie_id,
          title: row.title,
          total_tickets: Number(row.total_tickets || 0),
          total_capacity: Number(row.total_capacity || 0),
          occupancy
        });

        slotMap.set(key, items);
      }

      const incidents = [];

      for (const items of slotMap.values()) {
        if (items.length < 2) {
          continue;
        }

        const strongest = [...items].sort((left, right) => right.occupancy - left.occupancy)[0];

        if (strongest.occupancy < Number(min_competitor_occupancy)) {
          continue;
        }

        for (const item of items) {
          if (item.movie_id === strongest.movie_id) {
            continue;
          }

          if (item.occupancy > Number(max_impacted_occupancy)) {
            continue;
          }

          incidents.push({
            impacted_movie_id: item.movie_id,
            impacted_title: item.title,
            competitor_movie_id: strongest.movie_id,
            competitor_title: strongest.title,
            cinema_id: item.cinema_id,
            cinema_name: item.cinema_name,
            city: item.city,
            show_date: item.show_date,
            time_slot: item.time_slot,
            impacted_occupancy: item.occupancy,
            competitor_occupancy: strongest.occupancy,
            occupancy_gap: roundNumber(strongest.occupancy - item.occupancy),
            suggested_action: "Pertimbangkan pindah jam tayang, kurangi overlap, atau ganti studio.",
            is_rule_based: true
          });
        }
      }

      incidents.sort((left, right) => right.occupancy_gap - left.occupancy_gap);

      return {
        summary: {
          total_slots_analyzed: slotMap.size,
          possible_cannibalization_cases: incidents.length,
          is_rule_based: true
        },
        breakdown: incidents
      };
    }
  );
}
