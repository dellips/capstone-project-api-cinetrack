import Fastify from "fastify";
import authRoutes from "./routes/auth.routes.js";
import baseRoutes from "./routes/base.routes.js";
import cinemaRoutes from "./routes/cinemas.routes.js";
import docsRoutes from "./routes/docs.routes.js";
import movieRoutes from "./routes/movies.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import systemRoutes from "./routes/system.routes.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { errorResponse } from "./utils/response.js";
import { closeRedisClient } from "./redis.js";

const routePlugins = [
  baseRoutes,
  authRoutes,
  cinemaRoutes,
  docsRoutes,
  movieRoutes,
  notificationRoutes,
  settingsRoutes,
  statsRoutes,
  systemRoutes
];

// Memilih origin CORS yang valid dan mengembalikan null bila origin tidak diizinkan.
function getCorsOrigin(origin) {
  if (config.corsOrigins.includes("*")) {
    return "*";
  }

  if (!origin) {
    return null;
  }

  return config.corsOrigins.includes(origin) ? origin : null;
}

// Menentukan status error yang dipakai response global, termasuk validasi schema Fastify.
function getStatusCode(error) {
  if (error.validation) {
    return 422;
  }

  return error.statusCode || 500;
}

// Mengubah status error menjadi kode yang stabil untuk dipakai frontend.
function getErrorCode(error, statusCode) {
  if (error.errorCode) {
    return error.errorCode;
  }

  const codes = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE"
  };

  return codes[statusCode] || "INTERNAL_ERROR";
}

// Merapikan detail validasi schema agar frontend mudah menandai field yang bermasalah.
function getErrorDetails(error, statusCode) {
  if (statusCode !== 422 || !error.validation) {
    return error.details ?? null;
  }

  return error.validation.map((item) => ({
    field: item.instancePath.replace(/^\//, "") || item.params?.missingProperty || null,
    message: item.message || "Invalid value"
  }));
}

// Mendaftarkan route yang sama ke prefix tertentu agar kontrak lama dan baru tetap hidup.
function registerRoutes(app, prefix = "") {
  for (const plugin of routePlugins) {
    app.register(plugin, { prefix });
  }
}

// Membuat instance Fastify, hook CORS, error handler, dan seluruh route aplikasi.
export function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const allowedOrigin = getCorsOrigin(origin);

    if (allowedOrigin) {
      reply.header("Access-Control-Allow-Origin", allowedOrigin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      reply.header("Access-Control-Allow-Credentials", "true");
    }

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = getStatusCode(error);
    const errorCode = getErrorCode(error, statusCode);
    const details = getErrorDetails(error, statusCode);
    const message = statusCode === 500
      ? "Internal Server Error"
      : error.message || "Request failed";

    reply.status(statusCode).send(errorResponse(errorCode, message, details));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorResponse("NOT_FOUND", `Route ${request.method} ${request.url} not found`));
  });

  app.addHook("onClose", async () => {
    await closeRedisClient();
    await pool.end();
  });

  registerRoutes(app);
  registerRoutes(app, "/api/v1");

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
