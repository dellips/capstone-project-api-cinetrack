import {
  getMovieStats,
  getOccupancy,
  getSummary,
  getTrends
} from "../services/stats.service.js";
import { statsRouteSchemas } from "../schemas.js";

export default async function statsRoutes(fastify) {
  fastify.get("/stats/summary", { schema: statsRouteSchemas.summary }, async (request) =>
    getSummary(request.query)
  );
  fastify.get("/stats/trends", { schema: statsRouteSchemas.trends }, async (request) =>
    getTrends(request.query)
  );
  fastify.get("/stats/occupancy", { schema: statsRouteSchemas.occupancy }, async (request) =>
    getOccupancy(request.query)
  );
  fastify.get("/stats/movie", { schema: statsRouteSchemas.movie }, async (request) =>
    getMovieStats(request.query)
  );
}
