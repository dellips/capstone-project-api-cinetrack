import { getCinemas } from "../services/cinemas.service.js";
import { cinemaRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint analitik bioskop beserta metadata filter yang aktif.
export default async function cinemaRoutes(fastify) {
  fastify.get(
    "/cinemas",
    { schema: cinemaRouteSchemas.cinemas },
    async (request) => {
      const filters = {
        city: request.query.city ?? null,
        cinema_id: request.query.cinema_id ?? null
      };

      return successResponse(await getCinemas(filters), {
        filters
      });
    }
  );
}
