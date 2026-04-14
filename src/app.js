import Fastify from "fastify";
import authRoutes from "./routes/auth.routes.js";
import aiInsightRoutes from "./routes/ai-insights.routes.js";
import baseRoutes from "./routes/base.routes.js";
import cinemaRoutes from "./routes/cinemas.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import docsRoutes from "./routes/docs.routes.js";
import movieRoutes from "./routes/movies.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import systemRoutes from "./routes/system.routes.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { getCacheContext, runWithCacheContext } from "./utils/cache.js";
import { getTelemetryContext, runWithTelemetryContext } from "./utils/telemetry.js";
import { errorResponse } from "./utils/response.js";
import { closeRedisClient } from "./redis.js";

const routePlugins = [
  baseRoutes,
  authRoutes,
  aiInsightRoutes,
  cinemaRoutes,
  dashboardRoutes,
  docsRoutes,
  movieRoutes,
  notificationRoutes,
  settingsRoutes,
  statsRoutes,
  systemRoutes
];

function getCorsOrigin(origin) {
  if (config.corsOrigins.includes("*")) {
    return "*";
  }

  if (!origin) {
    return null;
  }

  return config.corsOrigins.includes(origin) ? origin : null;
}

function getStatusCode(error) {
  if (error.validation) {
    return 422;
  }

  return error.statusCode || 500;
}

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

function getErrorDetails(error, statusCode) {
  if (statusCode !== 422 || !error.validation) {
    return error.details ?? null;
  }

  return error.validation.map((item) => ({
    field: item.instancePath.replace(/^\//, "") || item.params?.missingProperty || null,
    message: item.message || "Invalid value"
  }));
}

function registerRoutes(app, prefix = "") {
  for (const plugin of routePlugins) {
    app.register(plugin, { prefix });
  }
}

export function buildApp() {
  const app = Fastify({
    logger: true
  });

  if (config.isServerlessRuntime && !config.allowServerlessRedis && config.redisUrl) {
    app.log.warn("Redis cache is disabled in serverless runtime. Set ALLOW_SERVERLESS_REDIS=true only if your Redis plan can handle concurrent serverless clients.");
  }

  app.addHook("onRequest", async (request, reply) => {
    request.requestStartedAt = process.hrtime.bigint();
    return runWithTelemetryContext(
      {
        requestId: request.id,
        method: request.method,
        url: request.url
      },
      () =>
        runWithCacheContext(async () => {
          const origin = request.headers.origin;
          const allowedOrigin = getCorsOrigin(origin);

          if (allowedOrigin) {
            reply.header("Access-Control-Allow-Origin", allowedOrigin);
            reply.header("Vary", "Origin");
            reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            reply.header("Access-Control-Allow-Credentials", "true");
          }

          if (request.method === "OPTIONS") {
            return reply.status(204).send();
          }
        })
    );
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const cacheContext = getCacheContext();

    reply.header("X-Cache", cacheContext?.status || "BYPASS");

    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    const telemetry = getTelemetryContext();
    if (!telemetry) return;

    const slowRequestMs = Number(process.env.TELEMETRY_SLOW_REQUEST_MS || 600);
    const elapsedMs =
      request.requestStartedAt != null
        ? Number(process.hrtime.bigint() - request.requestStartedAt) / 1_000_000
        : 0;

    const payload = {
      request_id: telemetry.requestId || request.id,
      method: telemetry.method || request.method,
      route: telemetry.url || request.url,
      status_code: reply.statusCode,
      duration_ms: Number(elapsedMs.toFixed(2)),
      db_query_count: telemetry.queryCount || 0,
      db_total_ms: Number((telemetry.totalQueryMs || 0).toFixed(2))
    };

    if (elapsedMs >= slowRequestMs) {
      request.log.warn({
        ...payload,
        slow_queries: telemetry.slowQueries || []
      }, "slow_request");
      return;
    }

    request.log.info(payload, "request_timing");
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
