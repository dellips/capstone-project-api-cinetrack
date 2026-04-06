import { loginAdmin } from "../services/auth.service.js";
import { authRouteSchemas } from "../schemas.js";

export default async function authRoutes(fastify) {
  fastify.post(
    "/auth/login",
    { schema: authRouteSchemas.login },
    async (request) => loginAdmin(request.body)
  );
}
