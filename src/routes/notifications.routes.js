import {
  getAlertsSummary,
  getNotificationDetail,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../services/notifications.service.js";
import { notificationRouteSchemas } from "../schemas.js";
import { successResponse } from "../utils/response.js";

// Mendaftarkan endpoint notifikasi dan alert yang dipakai dashboard admin.
export default async function notificationRoutes(fastify) {
  fastify.get("/notifications", { schema: notificationRouteSchemas.notifications }, async (request) => {
    const result = await getNotifications(request.query);
    return successResponse(result.data, result.meta);
  });

  fastify.get(
    "/notifications/:notification_id",
    { schema: notificationRouteSchemas.notificationDetail },
    async (request) => successResponse(await getNotificationDetail(request.params.notification_id))
  );

  fastify.patch(
    "/notifications/:notification_id/read",
    { schema: notificationRouteSchemas.notificationRead },
    async (request) => successResponse(await markNotificationRead(request.params.notification_id))
  );

  fastify.patch(
    "/notifications/read-all",
    { schema: notificationRouteSchemas.notificationReadAll },
    async () => successResponse(await markAllNotificationsRead())
  );

  fastify.get("/alerts/summary", { schema: notificationRouteSchemas.alertSummary }, async () =>
    successResponse(await getAlertsSummary())
  );
}
