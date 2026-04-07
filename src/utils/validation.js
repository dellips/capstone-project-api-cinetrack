import { query } from "../db.js";
import { createHttpError } from "./http-error.js";

// Memastikan filter relasional valid agar query analytics tidak menerima kombinasi yang salah.
export async function validateFilters({ city = null, cinemaId = null, studioId = null }) {
  if (cinemaId) {
    const cinemaResult = await query(
      "SELECT city FROM cinema WHERE cinema_id = $1",
      [cinemaId]
    );

    if (cinemaResult.rowCount === 0) {
      throw createHttpError(404, "cinema_id not found", "CINEMA_NOT_FOUND");
    }

    if (city && cinemaResult.rows[0].city !== city) {
      throw createHttpError(
        422,
        "cinema_id does not belong to the given city",
        "INVALID_FILTER_COMBINATION"
      );
    }
  }

  if (studioId) {
    const studioResult = await query(
      "SELECT cinema_id FROM studio WHERE studio_id = $1",
      [studioId]
    );

    if (studioResult.rowCount === 0) {
      throw createHttpError(404, "studio_id not found", "STUDIO_NOT_FOUND");
    }

    if (cinemaId && studioResult.rows[0].cinema_id !== cinemaId) {
      throw createHttpError(
        422,
        "studio_id does not belong to cinema_id",
        "INVALID_FILTER_COMBINATION"
      );
    }
  }
}
