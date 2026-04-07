import {
  getAllMovies,
  getAllStudios,
  getMoviesBySales,
  getSchedules,
  getTikets
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

  fastify.get("/movies", { schema: baseRouteSchemas.movies }, async () =>
    successResponse(await getAllMovies())
  );

  fastify.get("/studios", { schema: baseRouteSchemas.studios }, async () =>
    successResponse(await getAllStudios())
  );

  fastify.get("/schedules", { schema: baseRouteSchemas.schedules }, async () =>
    successResponse(await getSchedules())
  );

  fastify.get("/tikets", { schema: baseRouteSchemas.tikets }, async () =>
    successResponse(await getTikets())
  );

  fastify.get("/movie", { schema: baseRouteSchemas.movieRankings }, async (request) => {
    const filters = {
      top10: request.query.top10 ?? false,
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null
    };

    return successResponse(await getMoviesBySales(filters), {
      filters
    });
  });
}
