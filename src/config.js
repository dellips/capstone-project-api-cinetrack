import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });

export const config = {
  host: process.env.HOST,
  port: Number(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
