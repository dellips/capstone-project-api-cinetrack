import { getSystemHealth } from "../services/system.service.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint health check backend untuk dashboard frontend.
export default async function systemRoutes(fastify) {
  fastify.get("/system/health", async (request, reply) => {
    const health = await getSystemHealth();

    if (health.status !== "active") {
      reply.code(503);
    }

    return successResponse(health);
  });
}
