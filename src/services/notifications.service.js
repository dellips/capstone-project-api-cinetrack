import { getSystemHealth } from "./system.service.js";
import { getSummary } from "./stats.service.js";
import { getCinemaStats } from "./cinemas.service.js";
import { createHttpError } from "../utils/http-error.js";
import { buildPaginationMeta, resolvePagination } from "../utils/pagination.js";
import { readAppState, updateAppState } from "../utils/state.js";

// Menentukan notifikasi dari kondisi backend agar dashboard tetap punya sumber alert yang berguna.
async function buildNotifications() {
  const [health, summary, cinemaStats] = await Promise.all([
    getSystemHealth(),
    getSummary({ compare: true }),
    getCinemaStats({})
  ]);

  const notifications = [];

  notifications.push({
    notification_id: "system-health",
    title: "Backend health",
    message:
      health.status === "active"
        ? "Backend is active and responding normally."
        : "Backend is inactive or cannot reach the database.",
    severity: health.status === "active" ? "success" : "critical",
    status: "unread",
    created_at: new Date().toISOString(),
    context: {
      status: health.status,
      last_data_in: health.last_data_in,
      tickets_last_hour: health.tickets_last_hour
    }
  });

  notifications.push({
    notification_id: "revenue-growth",
    title: "Revenue trend",
    message:
      summary.data.growth?.revenue < 0
        ? "Revenue is below the previous comparison window."
        : "Revenue is stable or above the previous comparison window.",
    severity: summary.data.growth?.revenue < -10 ? "warning" : "info",
    status: "unread",
    created_at: new Date().toISOString(),
    context: {
      growth: summary.data.growth?.revenue ?? 0
    }
  });

  notifications.push({
    notification_id: "occupancy-level",
    title: "Occupancy level",
    message:
      summary.data.avg_occupancy < 25
        ? "Overall occupancy is low and may need attention."
        : "Overall occupancy is within an acceptable range.",
    severity: summary.data.avg_occupancy < 20 ? "warning" : "info",
    status: "unread",
    created_at: new Date().toISOString(),
    context: {
      occupancy: summary.data.avg_occupancy
    }
  });

  notifications.push({
    notification_id: "cinema-activity",
    title: "Cinema activity",
    message: `${cinemaStats.summary.active_cinemas} of ${cinemaStats.summary.total_cinemas} cinemas are active.`,
    severity: cinemaStats.summary.active_cinemas === cinemaStats.summary.total_cinemas ? "success" : "warning",
    status: "unread",
    created_at: new Date().toISOString(),
    context: cinemaStats.summary
  });

  return notifications;
}

// Menempelkan status read dari state lokal ke daftar notifikasi hasil komputasi backend.
async function withReadState(notifications) {
  const state = await readAppState();

  return notifications.map((notification) => ({
    ...notification,
    status: state.notification_reads[notification.notification_id] ? "read" : "unread"
  }));
}

// Mengambil daftar notifikasi dengan filter severity, status, dan pagination.
export async function getNotifications({
  status = "all",
  severity = null,
  page = 1,
  limit = 20
} = {}) {
  const notifications = await withReadState(await buildNotifications());
  const filtered = notifications.filter((item) => {
    if (status !== "all" && item.status !== status) {
      return false;
    }

    if (severity && item.severity !== severity) {
      return false;
    }

    return true;
  });

  const pagination = resolvePagination(page, limit);
  const data = filtered.slice(pagination.offset, pagination.offset + pagination.limit);

  return {
    data,
    meta: {
      filters: {
        status,
        severity
      },
      pagination: buildPaginationMeta(filtered.length, pagination.page, pagination.limit)
    }
  };
}

// Mengambil satu notifikasi berdasarkan id agar halaman detail bisa dirender.
export async function getNotificationDetail(notificationId) {
  const notifications = await withReadState(await buildNotifications());
  const notification = notifications.find((item) => item.notification_id === notificationId);

  if (!notification) {
    throw createHttpError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  }

  return notification;
}

// Menandai satu notifikasi sebagai read di state lokal backend.
export async function markNotificationRead(notificationId) {
  await getNotificationDetail(notificationId);

  await updateAppState((state) => ({
    ...state,
    notification_reads: {
      ...state.notification_reads,
      [notificationId]: new Date().toISOString()
    }
  }));

  return getNotificationDetail(notificationId);
}

// Menandai semua notifikasi aktif sebagai read dalam satu operasi sederhana.
export async function markAllNotificationsRead() {
  const notifications = await buildNotifications();

  await updateAppState((state) => ({
    ...state,
    notification_reads: notifications.reduce(
      (accumulator, item) => ({
        ...accumulator,
        [item.notification_id]: new Date().toISOString()
      }),
      { ...state.notification_reads }
    )
  }));

  return {
    message: "All notifications marked as read"
  };
}

// Mengembalikan hitungan alert per severity dan unread untuk kartu ringkasan dashboard.
export async function getAlertsSummary() {
  const notifications = await withReadState(await buildNotifications());

  return notifications.reduce(
    (summary, item) => ({
      critical: summary.critical + (item.severity === "critical" ? 1 : 0),
      warning: summary.warning + (item.severity === "warning" ? 1 : 0),
      info: summary.info + (item.severity === "info" ? 1 : 0),
      unread: summary.unread + (item.status === "unread" ? 1 : 0)
    }),
    {
      critical: 0,
      warning: 0,
      info: 0,
      unread: 0
    }
  );
}
