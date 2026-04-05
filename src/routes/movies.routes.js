import { getMovieDetail } from "../services/movies.service.js";
import { movieRouteSchemas } from "../schemas.js";

export default async function movieRoutes(fastify) {
  fastify.get(
    "/movies/:movie_id",
    { schema: movieRouteSchemas.movieDetail },
    async (request) => getMovieDetail(request.params.movie_id)
  );
}
