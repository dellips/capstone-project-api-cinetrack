import Fastify from "fastify";
import baseRoutes from "./routes/base.routes.js";
import cinemaRoutes from "./routes/cinemas.routes.js";
import movieRoutes from "./routes/movies.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import systemRoutes from "./routes/system.routes.js";
import { pool } from "./db.js";

export function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode || 500;

    reply.status(statusCode).send({
      message: error.message || "Internal Server Error"
    });
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.register(baseRoutes);
  app.register(cinemaRoutes);
  app.register(movieRoutes);
  app.register(statsRoutes);
  app.register(systemRoutes);

  return app;
}

const app = buildApp();
let isReady = false;

async function ensureReady() {
  if (!isReady) {
    await app.ready();
    isReady = true;
  }
}

export default async function handler(req, res) {
  await ensureReady();
  app.server.emit("request", req, res);
}
