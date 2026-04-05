import { createHttpError } from "./http-error.js";

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
    const parsedStart = new Date(startDate);
    const parsedEnd = endOfDay(new Date(endDate));

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      throw createHttpError(400, "Invalid date format (YYYY-MM-DD)");
    }

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
  return new Date(value).toISOString().slice(0, 10);
}
