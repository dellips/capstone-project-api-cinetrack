import pg from "pg";
import { config } from "./config.js";
import { recordQueryMetric } from "./utils/telemetry.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: config.databaseUrl.includes("railway")
    ? { rejectUnauthorized: false }
    : undefined
});

export async function query(text, params = []) {
  const startedAt = process.hrtime.bigint();
  const result = await pool.query(text, params);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  recordQueryMetric(text, elapsedMs, result.rowCount);
  return result;
}
