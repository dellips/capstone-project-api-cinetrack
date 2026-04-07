import {
  getAllMovies,
  getAllStudios,
  getScheduleDetail,
  getSchedules,
  getStudioDetail,
  getTiketDetail,
  getTikets,
  getMoviesBySales,
} from "../services/base.service.js";
import { baseRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint dasar untuk master data dan ranking film.
export default async function baseRoutes(fastify) {
  fastify.get("/", { schema: baseRouteSchemas.root }, async () =>
    successResponse({
      message: "Cinema Analytics API is running"
    })
  );

  fastify.get("/movies", { schema: baseRouteSchemas.movies }, async (request) => {
    const result = await getAllMovies(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/studios", { schema: baseRouteSchemas.studios }, async (request) => {
    const result = await getAllStudios(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/studios/:studio_id", { schema: baseRouteSchemas.studioDetail }, async (request) =>
    successResponse(await getStudioDetail(request.params.studio_id))
  );

  fastify.get("/schedules", { schema: baseRouteSchemas.schedules }, async (request) => {
    const result = await getSchedules(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/schedules/:schedule_id", { schema: baseRouteSchemas.scheduleDetail }, async (request) =>
    successResponse(await getScheduleDetail(request.params.schedule_id))
  );

  fastify.get("/tikets", { schema: baseRouteSchemas.tikets }, async (request) => {
    const result = await getTikets(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get("/tikets/:tiket_id", { schema: baseRouteSchemas.tiketDetail }, async (request) =>
    successResponse(await getTiketDetail(request.params.tiket_id))
  );

  fastify.get("/movie", { schema: baseRouteSchemas.movieRankings }, async (request) => {
    const filters = {
      top10: request.query.top10 ?? false,
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null,
      start_date: request.query.start_date ?? null,
      end_date: request.query.end_date ?? null
    };

    return successResponse(await getMoviesBySales(filters), {
      filters
    });
  });
}
