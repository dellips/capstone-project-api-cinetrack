import { query } from "../db.js";
import { createHttpError } from "./http-error.js";

export async function validateFilters({ city = null, cinemaId = null, studioId = null }) {
  if (cinemaId) {
    const cinemaResult = await query(
      "SELECT city FROM cinema WHERE cinema_id = $1",
      [cinemaId]
    );

    if (cinemaResult.rowCount === 0) {
      throw createHttpError(400, "cinema_id not found");
    }

    if (city && cinemaResult.rows[0].city !== city) {
      throw createHttpError(400, "cinema_id does not belong to the given city");
    }
  }

  if (studioId) {
    const studioResult = await query(
      "SELECT cinema_id FROM studio WHERE studio_id = $1",
      [studioId]
    );

    if (studioResult.rowCount === 0) {
      throw createHttpError(400, "studio_id not found");
    }

    if (cinemaId && studioResult.rows[0].cinema_id !== cinemaId) {
      throw createHttpError(400, "studio_id does not belong to cinema_id");
    }
  }
}
