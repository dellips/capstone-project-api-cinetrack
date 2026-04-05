import { query } from "../db.js";

export async function getSystemHealth() {
  let status = "active";

  try {
    await query("SELECT 1");
  } catch (error) {
    status = "inactive";
  }

  const lastResult = await query(
    "SELECT MAX(CAST(trans_time AS TIMESTAMP)) AS last_data_in FROM tiket"
  );
  const countResult = await query(
    `SELECT COUNT(*)::int AS tickets_last_hour
     FROM tiket
     WHERE trans_time::timestamp >= NOW() - INTERVAL '1 hour'`
  );

  return {
    status,
    last_data_in: lastResult.rows[0]?.last_data_in
      ? String(lastResult.rows[0].last_data_in)
      : null,
    tickets_last_hour: Number(countResult.rows[0]?.tickets_last_hour || 0)
  };
}
