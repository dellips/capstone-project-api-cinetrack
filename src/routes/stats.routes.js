import {
  getMovieStats,
  getOccupancy,
  getSummary,
  getTrends
} from "../services/stats.service.js";
import { statsRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan seluruh endpoint statistik dan menambahkan metadata filter yang dikirim frontend.
export default async function statsRoutes(fastify) {
  fastify.get("/stats/summary", { schema: statsRouteSchemas.summary }, async (request) => {
    const result = await getSummary(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/stats/trends", { schema: statsRouteSchemas.trends }, async (request) => {
    const filters = {
      start_date: request.query.start_date ?? null,
      end_date: request.query.end_date ?? null,
      group_by: request.query.group_by ?? "hourly",
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null,
      movie_id: request.query.movie_id ?? null,
      studio_id: request.query.studio_id ?? null
    };

    return successResponse(await getTrends(request.query), {
      filters
    });
  });

  fastify.get("/stats/occupancy", { schema: statsRouteSchemas.occupancy }, async (request) => {
    const filters = {
      start_date: request.query.start_date ?? null,
      end_date: request.query.end_date ?? null,
      group_by: request.query.group_by ?? "hourly",
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null,
      movie_id: request.query.movie_id ?? null,
      studio_id: request.query.studio_id ?? null
    };

    return successResponse(await getOccupancy(request.query), {
      filters
    });
  });

  fastify.get("/stats/movie", { schema: statsRouteSchemas.movie }, async (request) => {
    const filters = {
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null,
      rating_usia: request.query.rating_usia ?? null
    };

    return successResponse(await getMovieStats(request.query), {
      filters
    });
  });
}
