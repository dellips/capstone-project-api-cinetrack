import { query } from "../db.js";

// Mengambil status koneksi dan aktivitas tiket terbaru untuk indikator health frontend.
export async function getSystemHealth() {
  try {
    await query("SELECT 1");

    const [lastResult, countResult] = await Promise.all([
      query("SELECT MAX(CAST(trans_time AS TIMESTAMP)) AS last_data_in FROM tiket"),
      query(
        `SELECT COUNT(*)::int AS tickets_last_hour
         FROM tiket
         WHERE trans_time::timestamp >= NOW() - INTERVAL '1 hour'`
      )
    ]);

    return {
      status: "active",
      last_data_in: lastResult.rows[0]?.last_data_in
        ? new Date(lastResult.rows[0].last_data_in).toISOString()
        : null,
      tickets_last_hour: Number(countResult.rows[0]?.tickets_last_hour || 0)
    };
  } catch (error) {
    return {
      status: "inactive",
      last_data_in: null,
      tickets_last_hour: 0
    };
  }
}
