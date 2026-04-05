import { getSystemHealth } from "../services/system.service.js";

export default async function systemRoutes(fastify) {
  fastify.get("/system/health", async () => getSystemHealth());
}
