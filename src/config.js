import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });

const isServerlessRuntime = Boolean(
  process.env.VERCEL
  || process.env.AWS_LAMBDA_FUNCTION_NAME
  || process.env.AWS_EXECUTION_ENV
);
const allowServerlessRedis = (process.env.ALLOW_SERVERLESS_REDIS || "false") === "true";
const requestedCacheEnabled = (process.env.CACHE_ENABLED || "true") !== "false";
const resolvedRedisUrl = process.env.REDIS_URL || "";
const resolvedCacheEnabled = requestedCacheEnabled
  && Boolean(resolvedRedisUrl)
  && (!isServerlessRuntime || allowServerlessRedis);

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL,
  authSecret: process.env.AUTH_SECRET || "cinetrack-dev-secret",
  redisUrl: resolvedRedisUrl,
  cacheEnabled: resolvedCacheEnabled,
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 120),
  redisConnectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  aiApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY,
  aiBaseUrl: process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL,
  aiModel: process.env.AI_MODEL || process.env.OPENAI_MODEL || "openai/gpt-5-mini",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 90000),
  corsOrigins: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  isServerlessRuntime,
  allowServerlessRedis
};

const requiredEnv = [
  ["DATABASE_URL", config.databaseUrl],
  ["AUTH_SECRET", config.authSecret]
];

const missingEnv = requiredEnv.filter(([, value]) => !value).map(([key]) => key);
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}
