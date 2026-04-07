import { createHttpError } from "../utils/http-error.js";
import { readAppState, updateAppState } from "../utils/state.js";

const ALLOWED_THEMES = ["light", "dark", "system"];

// Mengambil konfigurasi admin yang disimpan lokal untuk kebutuhan dashboard.
export async function getSettings() {
  const state = await readAppState();
  return state.settings;
}

// Memvalidasi dan menyimpan perubahan settings admin yang diizinkan backend.
export async function updateSettings(input) {
  const nextSettings = {};

  if (input.theme_default != null) {
    if (!ALLOWED_THEMES.includes(input.theme_default)) {
      throw createHttpError(422, "theme_default is invalid", "VALIDATION_ERROR");
    }

    nextSettings.theme_default = input.theme_default;
  }

  if (input.refresh_interval_sec != null) {
    const value = Number(input.refresh_interval_sec);

    if (!Number.isInteger(value) || value <= 0) {
      throw createHttpError(422, "refresh_interval_sec must be a positive integer", "VALIDATION_ERROR");
    }

    nextSettings.refresh_interval_sec = value;
  }

  const state = await updateAppState((currentState) => ({
    ...currentState,
    settings: {
      ...currentState.settings,
      ...nextSettings
    }
  }));

  return state.settings;
}
