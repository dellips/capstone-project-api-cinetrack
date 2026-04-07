import { getMovieDetail, getMoviePerformance } from "../services/movies.service.js";
import { movieRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint detail film dan meneruskan 404 bila film tidak ditemukan.
export default async function movieRoutes(fastify) {
  fastify.get(
    "/movies/:movie_id",
    { schema: movieRouteSchemas.movieDetail },
    async (request) => successResponse(await getMovieDetail(request.params.movie_id))
  );

  fastify.get(
    "/movies/:movie_id/performance",
    { schema: movieRouteSchemas.moviePerformance },
    async (request) =>
      successResponse(
        await getMoviePerformance(request.params.movie_id, request.query),
        {
          filters: {
            city: request.query.city ?? null,
            cinema_id: request.query.cinema_id ?? null,
            start_date: request.query.start_date ?? null,
            end_date: request.query.end_date ?? null
          }
        }
      )
  );
}
