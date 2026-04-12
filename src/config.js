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
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:ehjuzXxMsegHaLjXJTuAcBWXHlDNdDCt@gondola.proxy.rlwy.net:19300/railway",
  authSecret: process.env.AUTH_SECRET || "cinetrack-dev-secret",
  redisUrl: process.env.REDIS_URL || "redis://default:BF9lvh8RrSiJL9oOtj0HFwJ5c5ghPpSG@redis-10460.crce302.ap-seast-1-3.ec2.cloud.redislabs.com:10460",
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
