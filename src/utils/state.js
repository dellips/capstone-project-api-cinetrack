import { query } from "../db.js";

const MAX_REFRESH_TOKENS_PER_USER = 5;

// Menyediakan state awal untuk settings, refresh token, dan read status notification.
function createDefaultState() {
  return {
    settings: {
      theme_default: "system",
      refresh_interval_sec: 60
    },
    refresh_tokens: [],
    notification_reads: {}
  };
}

// Memastikan tabel state tersedia di database.
async function ensureStateTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS application_state (
      id INT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  const result = await query("SELECT id FROM application_state WHERE id = 1");
  if (result.rows.length === 0) {
    const defaultData = createDefaultState();
    await query("INSERT INTO application_state (id, data) VALUES (1, $1)", [JSON.stringify(defaultData)]);
  }
}

// Membaca state lokal aplikasi dari database PostgreSQL.
export async function readAppState() {
  await ensureStateTable();
  const result = await query("SELECT data FROM application_state WHERE id = 1");
  return result.rows[0]?.data || createDefaultState();
}

// Menyimpan state lokal aplikasi setelah token, settings, atau notification berubah.
export async function writeAppState(state) {
  await ensureStateTable();
  await query("UPDATE application_state SET data = $1 WHERE id = 1", [JSON.stringify(state)]);
}

// Memperbarui state dengan pola read-modify-write.
export async function updateAppState(updater) {
  // Simple transaction control can be added here if needed in the future
  const currentState = await readAppState();
  const nextState = await updater(currentState);
  await writeAppState(nextState);
  return nextState;
}

// Menghapus refresh token kadaluarsa dan membatasi jumlah per user agar array state tidak membengkak.
export function pruneRefreshTokens(tokens) {
  const grouped = new Map();

  for (const entry of tokens) {
    const userId = entry.user_id || "unknown";
    const bucket = grouped.get(userId) || [];
    bucket.push(entry);
    grouped.set(userId, bucket);
  }

  const pruned = [];

  for (const [, bucket] of grouped) {
    const sorted = bucket.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    pruned.push(...sorted.slice(0, MAX_REFRESH_TOKENS_PER_USER));
  }

  return pruned;
}
