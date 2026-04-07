import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateDir = path.resolve(__dirname, "../data");
const stateFile = path.join(stateDir, "app-state.json");

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

// Memastikan file state tersedia sebelum dipakai endpoint yang butuh penyimpanan lokal.
async function ensureStateFile() {
  try {
    await fs.access(stateFile);
  } catch {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify(createDefaultState(), null, 2));
  }
}

// Membaca state lokal aplikasi dari file JSON yang sederhana.
export async function readAppState() {
  await ensureStateFile();
  const content = await fs.readFile(stateFile, "utf8");
  return JSON.parse(content);
}

// Menyimpan state lokal aplikasi setelah token, settings, atau notification berubah.
export async function writeAppState(state) {
  await ensureStateFile();
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

// Memperbarui state dengan pola read-modify-write agar kode pemanggil tetap ringkas.
export async function updateAppState(updater) {
  const currentState = await readAppState();
  const nextState = await updater(currentState);
  await writeAppState(nextState);
  return nextState;
}
