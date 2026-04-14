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
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:ehjuzXxMsegHaLjXJTuAcBWXHlDNdDCt@gondola.proxy.rlwy.net:19300/railway",
  authSecret: process.env.AUTH_SECRET || "cinetrack-dev-secret",
  redisUrl: resolvedRedisUrl,
  cacheEnabled: resolvedCacheEnabled,
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 120),
  redisConnectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  aiApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYwMTAzMTUsIm5iZiI6MTc3NjAxMDMxNSwia2V5X2lkIjoiMDRmZmFhNzktYzU3Yy00NWU3LTg5ZTEtMDU2NzRlZTZhOTg3In0.KOKErNC9ADIAXpktw1RzLyYWvWX7URdLrppuw-YuN9Q",
  aiBaseUrl: process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://mlapi.run/ec6741df-87b6-4eb2-8db5-142337cd29a8/v1",
  aiModel: process.env.AI_MODEL || process.env.OPENAI_MODEL || "openai/gpt-5-mini",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 90000),
  corsOrigins: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  isServerlessRuntime,
  allowServerlessRedis
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required — set it in .env");
}

if (!config.authSecret) {
  throw new Error("AUTH_SECRET is required — set it in .env");
}
