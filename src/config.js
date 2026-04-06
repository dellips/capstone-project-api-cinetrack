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
  corsOrigins: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
