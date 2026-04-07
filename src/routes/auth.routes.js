import { loginAdmin } from "../services/auth.service.js";
import { authRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint login admin dan membungkus hasilnya ke format sukses global.
export default async function authRoutes(fastify) {
  fastify.post(
    "/auth/login",
    { schema: authRouteSchemas.login },
    async (request) => successResponse(await loginAdmin(request.body))
  );
}
