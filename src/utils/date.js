import { createHttpError } from "./http-error.js";

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const result = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    result.getFullYear() !== Number(year) ||
    result.getMonth() !== Number(month) - 1 ||
    result.getDate() !== Number(day)
  ) {
    return null;
  }

  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function resolveDateRange(startDate, endDate, period = "daily") {
  if (startDate && endDate) {
    const parsedStart = parseDateOnly(startDate);
    const parsedEndBase = parseDateOnly(endDate);

    if (!parsedStart || !parsedEndBase) {
      throw createHttpError(400, "Invalid date format (YYYY-MM-DD)");
    }

    const parsedEnd = endOfDay(parsedEndBase);

    if (parsedStart > parsedEnd) {
      throw createHttpError(400, "start_date cannot be greater than end_date");
    }

    return { startDate: parsedStart, endDate: parsedEnd };
  }

  const now = new Date();
  let rangeStart;
  let rangeEnd;

  if (period === "daily") {
    rangeStart = startOfDay(now);
    rangeEnd = endOfDay(now);
  } else if (period === "weekly") {
    rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - 7);
    rangeEnd = now;
  } else if (period === "monthly") {
    rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - 30);
    rangeEnd = now;
  } else {
    throw createHttpError(400, "Invalid period");
  }

  return { startDate: rangeStart, endDate: rangeEnd };
}

export function formatDateOnly(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Mengembalikan range tanggal opsional dan menolak jika hanya salah satu sisi yang dikirim.
export function resolveOptionalDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return null;
  }

  if (!startDate || !endDate) {
    throw createHttpError(400, "start_date and end_date must be provided together");
  }

  return resolveDateRange(startDate, endDate, "daily");
}
