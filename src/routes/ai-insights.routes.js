import {
  generateAiInsightController,
  generateAiInsightCronController,
  getLatestAiInsightController
} from "../controllers/ai-insights.controller.js";
import { aiInsightRouteSchemas } from "../schemas.js";

export default async function aiInsightRoutes(fastify) {
  fastify.post("/ai/insights/generate", { schema: aiInsightRouteSchemas.generate }, generateAiInsightController);
  fastify.post("/ai/insights/cron", { schema: aiInsightRouteSchemas.cron }, generateAiInsightCronController);
  fastify.get("/ai/insights/latest", { schema: aiInsightRouteSchemas.latest }, getLatestAiInsightController);
}
