import {
  getCannibalization,
  getCities,
  getDashboardNotifications,
  getEarlyBlockbuster,
  getExecutiveDashboard,
  getFilmsDistribution,
  getFilmsOccupancy,
  getFilmsOperationalRisk,
  getFilmsOverview,
  getFilmsPerformance,
  getFilmsSchedules,
  getPaymentConfigs,
  getPricingRecommendations,
  getSalesOperationalRisk,
  getSalesOverview,
  getSalesPayment,
  getSalesRevenueByCinema,
  getSalesRevenueByMovie,
  getSalesTimeSlots,
  getSalesTrend
} from "../services/dashboard.service.js";
import { dashboardRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint dashboard agregat agar frontend tidak perlu menghitung ulang insight berat.
export default async function dashboardRoutes(fastify) {
  fastify.get("/dashboard/executive", { schema: dashboardRouteSchemas.executive }, async (request) =>
    successResponse(await getExecutiveDashboard(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/sales/overview", { schema: dashboardRouteSchemas.salesOverview }, async (request) =>
    successResponse(await getSalesOverview(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/dashboard/sales/revenue-by-cinema",
    { schema: dashboardRouteSchemas.salesRevenueByCinema },
    async (request) => successResponse(await getSalesRevenueByCinema(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/dashboard/sales/revenue-by-movie",
    { schema: dashboardRouteSchemas.salesRevenueByMovie },
    async (request) => successResponse(await getSalesRevenueByMovie(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/sales/time-slots", { schema: dashboardRouteSchemas.salesTimeSlots }, async (request) =>
    successResponse(await getSalesTimeSlots(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/sales/trend", { schema: dashboardRouteSchemas.salesTrend }, async (request) =>
    successResponse(await getSalesTrend(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/sales/payment", { schema: dashboardRouteSchemas.salesPayment }, async (request) =>
    successResponse(await getSalesPayment(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/dashboard/sales/operational-risk",
    { schema: dashboardRouteSchemas.salesOperationalRisk },
    async (request) => successResponse(await getSalesOperationalRisk(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/films/overview", { schema: dashboardRouteSchemas.filmsOverview }, async (request) =>
    successResponse(await getFilmsOverview(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/films/performance", { schema: dashboardRouteSchemas.filmsPerformance }, async (request) =>
    successResponse(await getFilmsPerformance(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/films/schedules", { schema: dashboardRouteSchemas.filmsSchedules }, async (request) =>
    successResponse(await getFilmsSchedules(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/films/occupancy", { schema: dashboardRouteSchemas.filmsOccupancy }, async (request) =>
    successResponse(await getFilmsOccupancy(request.query), {
      filters: request.query
    })
  );

  fastify.get("/dashboard/films/distribution", { schema: dashboardRouteSchemas.filmsDistribution }, async (request) =>
    successResponse(await getFilmsDistribution(request.query), {
      filters: request.query
    })
  );

  fastify.get(
    "/dashboard/films/operational-risk",
    { schema: dashboardRouteSchemas.filmsOperationalRisk },
    async (request) => successResponse(await getFilmsOperationalRisk(request.query), {
      filters: request.query
    })
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
