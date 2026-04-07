import { getCurrentAdmin } from "../services/auth.service.js";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { settingsRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint konfigurasi admin yang wajib memakai access token bearer.
export default async function settingsRoutes(fastify) {
  fastify.get("/settings", { schema: settingsRouteSchemas.get }, async (request) => {
    await getCurrentAdmin(request.headers.authorization);
    return successResponse(await getSettings());
  });

  fastify.patch("/settings", { schema: settingsRouteSchemas.patch }, async (request) => {
    await getCurrentAdmin(request.headers.authorization);
    return successResponse(await updateSettings(request.body));
  });
}
