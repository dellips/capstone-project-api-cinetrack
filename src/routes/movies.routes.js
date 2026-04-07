import { getMovieDetail } from "../services/movies.service.js";
import { movieRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint detail film dan meneruskan 404 bila film tidak ditemukan.
export default async function movieRoutes(fastify) {
  fastify.get(
    "/movies/:movie_id",
    { schema: movieRouteSchemas.movieDetail },
    async (request) => successResponse(await getMovieDetail(request.params.movie_id))
  );
}
