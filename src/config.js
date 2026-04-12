import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL || "",
  authSecret: process.env.AUTH_SECRET || "",
  redisUrl: process.env.REDIS_URL || "",
  cacheEnabled: (process.env.CACHE_ENABLED || "true") !== "false",
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 120),
  redisConnectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  corsOrigins: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required — set it in .env");
}

if (!config.authSecret) {
  throw new Error("AUTH_SECRET is required — set it in .env");
}
