import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("railway")
    ? { rejectUnauthorized: false }
    : undefined
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
