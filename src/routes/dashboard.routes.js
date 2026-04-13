import {
  getCannibalization,
  getBestAdSlots,
  getCities,
  getDashboardNotifications,
  getEarlyBlockbuster,
  getExecutiveDashboard,
  getFilmsDistribution,
  getFilmsOccupancy,
  getFilmsAnalyticsBundle,
  getFilmsOperationalRisk,
  getFilmsOverview,
  getFilmsPerformance,
  getFilmsSchedules,
  getPaymentConfigs,
  getPricingRecommendations,
  getSalesAnalyticsBundle,
  getSalesOperationalRisk,
  getSalesOverview,
  getSalesPayment,
  getSalesRevenueByCinema,
  getSalesRevenueByStudio,
  getSalesRevenueByMovie,
  getSalesTimeSlots,
  getSalesWeekendVsWeekday,
  getSalesTrend
} from "../services/dashboard.service.js";
import { getCurrentAdmin } from "../services/auth.service.js";
import { dashboardRouteSchemas } from "../schemas.js";
import { buildAnalyticsMeta } from "../utils/analytics-meta.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint dashboard agregat agar frontend tidak perlu menghitung ulang insight berat.
export default async function dashboardRoutes(fastify) {
  fastify.addHook("onRequest", async (request) => {
    await getCurrentAdmin(request.headers.authorization);
  });

  fastify.get("/dashboard/executive", { schema: dashboardRouteSchemas.executive }, async (request) =>
    successResponse(await getExecutiveDashboard(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/sales/overview", { schema: dashboardRouteSchemas.salesOverview }, async (request) =>
    successResponse(await getSalesOverview(request.query), buildAnalyticsMeta(request.query, { section: "sales_overview" }))
  );

  fastify.get(
    "/dashboard/sales/revenue-by-cinema",
    { schema: dashboardRouteSchemas.salesRevenueByCinema },
    async (request) =>
      successResponse(
        await getSalesRevenueByCinema(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_revenue_by_cinema" })
      )
  );

  fastify.get(
    "/dashboard/sales/revenue-by-studio",
    { schema: dashboardRouteSchemas.salesRevenueByStudio },
    async (request) =>
      successResponse(
        await getSalesRevenueByStudio(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_revenue_by_studio" })
      )
  );

  fastify.get(
    "/dashboard/sales/revenue-by-movie",
    { schema: dashboardRouteSchemas.salesRevenueByMovie },
    async (request) =>
      successResponse(
        await getSalesRevenueByMovie(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_revenue_by_movie" })
      )
  );

  fastify.get("/dashboard/sales/time-slots", { schema: dashboardRouteSchemas.salesTimeSlots }, async (request) =>
    successResponse(await getSalesTimeSlots(request.query), buildAnalyticsMeta(request.query, { section: "sales_time_slots" }))
  );

  fastify.get("/dashboard/sales/trend", { schema: dashboardRouteSchemas.salesTrend }, async (request) =>
    successResponse(await getSalesTrend(request.query), buildAnalyticsMeta(request.query, { section: "sales_trend" }))
  );

  fastify.get(
    "/dashboard/sales/weekend-vs-weekday",
    { schema: dashboardRouteSchemas.salesWeekendVsWeekday },
    async (request) =>
      successResponse(
        await getSalesWeekendVsWeekday(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_weekend_vs_weekday" })
      )
  );

  fastify.get("/dashboard/sales/payment", { schema: dashboardRouteSchemas.salesPayment }, async (request) =>
    successResponse(await getSalesPayment(request.query), buildAnalyticsMeta(request.query, { section: "sales_payment" }))
  );

  fastify.get(
    "/dashboard/sales/operational-risk",
    { schema: dashboardRouteSchemas.salesOperationalRisk },
    async (request) =>
      successResponse(
        await getSalesOperationalRisk(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_operational_risk" })
      )
  );

  fastify.get(
    "/dashboard/sales/analytics",
    { schema: dashboardRouteSchemas.salesAnalyticsBundle },
    async (request) =>
      successResponse(
        await getSalesAnalyticsBundle(request.query),
        buildAnalyticsMeta(request.query, { section: "sales_analytics_bundle" })
      )
  );

  fastify.get("/dashboard/films/overview", { schema: dashboardRouteSchemas.filmsOverview }, async (request) =>
    successResponse(await getFilmsOverview(request.query), buildAnalyticsMeta(request.query, { section: "films_overview" }))
  );

  fastify.get("/dashboard/films/performance", { schema: dashboardRouteSchemas.filmsPerformance }, async (request) =>
    successResponse(
      await getFilmsPerformance(request.query),
      buildAnalyticsMeta(request.query, { section: "films_performance" })
    )
  );

  fastify.get("/dashboard/films/schedules", { schema: dashboardRouteSchemas.filmsSchedules }, async (request) =>
    successResponse(await getFilmsSchedules(request.query), buildAnalyticsMeta(request.query, { section: "films_schedules" }))
  );

  fastify.get("/dashboard/films/occupancy", { schema: dashboardRouteSchemas.filmsOccupancy }, async (request) =>
    successResponse(await getFilmsOccupancy(request.query), buildAnalyticsMeta(request.query, { section: "films_occupancy" }))
  );

  fastify.get("/dashboard/films/distribution", { schema: dashboardRouteSchemas.filmsDistribution }, async (request) =>
    successResponse(
      await getFilmsDistribution(request.query),
      buildAnalyticsMeta(request.query, { section: "films_distribution" })
    )
  );

  fastify.get(
    "/dashboard/films/operational-risk",
    { schema: dashboardRouteSchemas.filmsOperationalRisk },
    async (request) =>
      successResponse(
        await getFilmsOperationalRisk(request.query),
        buildAnalyticsMeta(request.query, { section: "films_operational_risk" })
      )
  );

  fastify.get(
    "/dashboard/films/analytics",
    { schema: dashboardRouteSchemas.filmsAnalyticsBundle },
    async (request) =>
      successResponse(
        await getFilmsAnalyticsBundle(request.query),
        buildAnalyticsMeta(request.query, { section: "films_analytics_bundle" })
      )
  );

  fastify.get("/dashboard/notifications", { schema: dashboardRouteSchemas.notifications }, async (request) => {
    const result = await getDashboardNotifications(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/payments/config", { schema: dashboardRouteSchemas.paymentsConfig }, async () =>
    successResponse(await getPaymentConfigs())
  );

  fastify.get("/cities", { schema: dashboardRouteSchemas.cities }, async () =>
    successResponse(await getCities())
  );

  fastify.get(
    "/analytics/pricing-recommendation",
    { schema: dashboardRouteSchemas.pricingRecommendation },
    async (request) => successResponse(await getPricingRecommendations(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/analytics/best-ad-slot",
    { schema: dashboardRouteSchemas.bestAdSlot },
    async (request) => successResponse(await getBestAdSlots(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/analytics/early-blockbuster",
    { schema: dashboardRouteSchemas.earlyBlockbuster },
    async (request) => successResponse(await getEarlyBlockbuster(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/analytics/cannibalization",
    { schema: dashboardRouteSchemas.cannibalization },
    async (request) => successResponse(await getCannibalization(request.query), {
      filters: request.query
    })
  );
}
