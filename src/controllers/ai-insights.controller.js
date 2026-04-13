import { generateAiInsight, generateAiInsightCronBatch, getLatestAiInsight } from "../services/ai-insights.service.js";
import { successResponse } from "../utils/response.js";

export async function generateAiInsightController(request) {
  const result = await generateAiInsight(request.body || {});
  return successResponse(result);
}

export async function generateAiInsightCronController() {
  const result = await generateAiInsightCronBatch();
  return successResponse(result);
}

export async function getLatestAiInsightController(request) {
  const result = await getLatestAiInsight(request.query || {});
  return successResponse(result);
}
