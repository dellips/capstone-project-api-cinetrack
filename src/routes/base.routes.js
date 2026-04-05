import {
  getAllMovies,
  getAllStudios,
  getMoviesBySales,
  getSchedules,
  getTikets
} from "../services/base.service.js";
import { baseRouteSchemas } from "../schemas.js";

export default async function baseRoutes(fastify) {
  fastify.get("/", { schema: baseRouteSchemas.root }, async () => ({
    message: "Cinema Analytics API is running"
  }));

  fastify.get("/movies", { schema: baseRouteSchemas.movies }, async () => getAllMovies());
  fastify.get("/studios", { schema: baseRouteSchemas.studios }, async () => getAllStudios());
  fastify.get("/schedules", { schema: baseRouteSchemas.schedules }, async () => getSchedules(10));
  fastify.get("/tikets", { schema: baseRouteSchemas.tikets }, async () => getTikets(10));
  fastify.get("/movie", { schema: baseRouteSchemas.movieRankings }, async (request) =>
    getMoviesBySales({
      top10: request.query.top10 ?? false,
      city: request.query.city ?? null,
      cinema_id: request.query.cinema_id ?? null
    })
  );
}
