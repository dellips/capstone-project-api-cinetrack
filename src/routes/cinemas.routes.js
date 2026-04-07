import {
  getCinemaDetail,
  getCinemaPerformance,
  getCinemas
} from "../services/cinemas.service.js";
import { cinemaRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint analitik bioskop beserta metadata filter yang aktif.
export default async function cinemaRoutes(fastify) {
  fastify.get(
    "/cinemas",
    { schema: cinemaRouteSchemas.cinemas },
    async (request) => {
      const result = await getCinemas(request.query);
      return successResponse(result.data, result.meta);
    }
  );

  fastify.get("/cinemas/:cinema_id", { schema: cinemaRouteSchemas.cinemaDetail }, async (request) =>
    successResponse(await getCinemaDetail(request.params.cinema_id))
  );

  fastify.get(
    "/cinemas/:cinema_id/performance",
    { schema: cinemaRouteSchemas.cinemaPerformance },
    async (request) =>
      successResponse(
        await getCinemaPerformance(request.params.cinema_id, request.query),
        {
          filters: {
            start_date: request.query.start_date ?? null,
            end_date: request.query.end_date ?? null
          }
        }
      )
  );
}
