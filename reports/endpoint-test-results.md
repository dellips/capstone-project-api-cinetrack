# Endpoint Test Results

Generated at: 2026-04-10T08:36:37.910Z

## Summary

- Total: 56
- Passed: 56
- Failed: 0

## Sample IDs

- movie_id: M001
- cinema_id: C001
- studio_id: ST-C001-1
- schedule_id: S000001
- ticket_id: T00000001

## Endpoint Results

- [PASS] GET /api/v1/ -> 200
- [PASS] GET /api/v1/openapi.json -> 200
- [PASS] GET /api/v1/docs -> 200
- [PASS] POST /api/v1/auth/login -> 200
- [PASS] GET /api/v1/auth/me -> 200
- [PASS] POST /api/v1/auth/refresh -> 200
- [PASS] GET /api/v1/movies?limit=5 -> 200
- [PASS] GET /api/v1/movies/M001 -> 200
- [PASS] GET /api/v1/movies/M001/performance -> 200
- [PASS] GET /api/v1/cinemas?limit=5 -> 200
- [PASS] GET /api/v1/cinemas/C001 -> 200
- [PASS] GET /api/v1/cinemas/C001/performance -> 200
- [PASS] GET /api/v1/studios?limit=5 -> 200
- [PASS] GET /api/v1/studios/ST-C001-1 -> 200
- [PASS] GET /api/v1/schedules?limit=5 -> 200
- [PASS] GET /api/v1/schedules/S000001 -> 200
- [PASS] GET /api/v1/tikets?limit=5 -> 200
- [PASS] GET /api/v1/tickets?limit=5 -> 200
- [PASS] GET /api/v1/tikets/T00000001 -> 200
- [PASS] GET /api/v1/tickets/T00000001 -> 200
- [PASS] GET /api/v1/movie?top10=true -> 200
- [PASS] GET /api/v1/stats/summary?compare=true -> 200
- [PASS] GET /api/v1/stats/trends?group_by=daily -> 200
- [PASS] GET /api/v1/stats/occupancy?group_by=daily -> 200
- [PASS] GET /api/v1/stats/movie -> 200
- [PASS] GET /api/v1/stats/cinema -> 200
- [PASS] GET /api/v1/dashboard/executive -> 200
- [PASS] GET /api/v1/dashboard/sales/overview -> 200
- [PASS] GET /api/v1/dashboard/sales/revenue-by-cinema -> 200
- [PASS] GET /api/v1/dashboard/sales/revenue-by-movie -> 200
- [PASS] GET /api/v1/dashboard/sales/time-slots -> 200
- [PASS] GET /api/v1/dashboard/sales/trend -> 200
- [PASS] GET /api/v1/dashboard/sales/payment -> 200
- [PASS] GET /api/v1/dashboard/sales/operational-risk -> 200
- [PASS] GET /api/v1/dashboard/films/overview -> 200
- [PASS] GET /api/v1/dashboard/films/performance -> 200
- [PASS] GET /api/v1/dashboard/films/schedules -> 200
- [PASS] GET /api/v1/dashboard/films/occupancy -> 200
- [PASS] GET /api/v1/dashboard/films/distribution -> 200
- [PASS] GET /api/v1/dashboard/films/operational-risk -> 200
- [PASS] GET /api/v1/notifications?limit=5 -> 200
- [PASS] GET /api/v1/dashboard/notifications?limit=5 -> 200
- [PASS] GET /api/v1/alerts/summary -> 200
- [PASS] GET /api/v1/payments/config -> 200
- [PASS] GET /api/v1/cities -> 200
- [PASS] GET /api/v1/system/health -> 200
- [PASS] GET /api/v1/system/status -> 200
- [PASS] GET /api/v1/analytics/pricing-recommendation -> 200
- [PASS] GET /api/v1/analytics/early-blockbuster -> 200
- [PASS] GET /api/v1/analytics/cannibalization -> 200
- [PASS] GET /api/v1/settings -> 200
- [PASS] PATCH /api/v1/settings -> 200
- [PASS] GET /api/v1/notifications/system-health -> 200
- [PASS] PATCH /api/v1/notifications/system-health/read -> 200
- [PASS] PATCH /api/v1/notifications/read-all -> 200
- [PASS] POST /api/v1/auth/logout -> 200

## Failures

No failed endpoints.
