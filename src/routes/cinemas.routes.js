import { getCinemas } from "../services/cinemas.service.js";
import { cinemaRouteSchemas } from "../schemas.js";

export default async function cinemaRoutes(fastify) {
  fastify.get(
    "/cinemas",
    { schema: cinemaRouteSchemas.cinemas },
    async (request) =>
      getCinemas({
        city: request.query.city ?? null,
        cinema_id: request.query.cinema_id ?? null
      })
  );
}
