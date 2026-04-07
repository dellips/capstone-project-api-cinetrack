import {
  getCurrentAdmin,
  loginAdmin,
  logoutAdmin,
  refreshAdminToken
} from "../services/auth.service.js";
import { authRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint login admin dan membungkus hasilnya ke format sukses global.
export default async function authRoutes(fastify) {
  fastify.post(
    "/auth/login",
    { schema: authRouteSchemas.login },
    async (request) => successResponse(await loginAdmin(request.body))
  );

  fastify.post(
    "/auth/refresh",
    { schema: authRouteSchemas.refresh },
    async (request) => successResponse(await refreshAdminToken(request.body.refresh_token))
  );

  fastify.post(
    "/auth/logout",
    { schema: authRouteSchemas.logout },
    async (request) => successResponse(await logoutAdmin(request.body?.refresh_token ?? null))
  );

  fastify.get(
    "/auth/me",
    { schema: authRouteSchemas.me },
    async (request) => successResponse(await getCurrentAdmin(request.headers.authorization))
  );
}
