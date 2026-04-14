# Endpoint Test Results

Generated at: 2026-04-14T16:17:11.115Z

## Summary

- Total: 60
- Passed: 56
- Failed: 4

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
- [FAIL] GET /api/v1/movie?top10=true -> 404
- [PASS] GET /api/v1/movies/rankings?top10=true -> 200
- [PASS] GET /api/v1/stats/summary?compare=true -> 200
- [PASS] GET /api/v1/stats/trends?group_by=daily -> 200
- [PASS] GET /api/v1/stats/occupancy?group_by=daily -> 200
- [PASS] GET /api/v1/stats/movie -> 200
- [PASS] GET /api/v1/stats/cinema -> 200
- [FAIL] GET /api/v1/dashboard/executive -> 500
- [PASS] GET /api/v1/dashboard/sales/overview -> 200
- [FAIL] GET /api/v1/dashboard/sales/revenue-by-cinema -> 500
- [PASS] GET /api/v1/dashboard/sales/revenue-by-studio -> 200
- [PASS] GET /api/v1/dashboard/sales/revenue-by-movie -> 200
- [PASS] GET /api/v1/dashboard/sales/time-slots -> 200
- [PASS] GET /api/v1/dashboard/sales/trend -> 200
- [PASS] GET /api/v1/dashboard/sales/weekend-vs-weekday -> 200
- [PASS] GET /api/v1/dashboard/sales/payment -> 200
- [PASS] GET /api/v1/dashboard/sales/operational-risk -> 200
- [FAIL] GET /api/v1/dashboard/films/overview -> 500
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
- [PASS] GET /api/v1/analytics/best-ad-slot -> 200
- [PASS] GET /api/v1/analytics/early-blockbuster -> 200
- [PASS] GET /api/v1/analytics/cannibalization -> 200
- [PASS] GET /api/v1/settings -> 200
- [PASS] PATCH /api/v1/settings -> 200
- [PASS] GET /api/v1/notifications/system-health -> 200
- [PASS] PATCH /api/v1/notifications/system-health/read -> 200
- [PASS] PATCH /api/v1/notifications/read-all -> 200
- [PASS] POST /api/v1/auth/logout -> 200

## Slowest Endpoints

- 16098ms — PATCH /api/v1/notifications/system-health/read (200)
- 8161ms — PATCH /api/v1/notifications/read-all (200)
- 7842ms — GET /api/v1/alerts/summary (200)
- 7526ms — GET /api/v1/notifications?limit=5 (200)
- 7468ms — GET /api/v1/system/status (200)
- 7399ms — GET /api/v1/dashboard/notifications?limit=5 (200)
- 6898ms — GET /api/v1/notifications/system-health (200)
- 6496ms — GET /api/v1/stats/cinema (200)
- 5831ms — GET /api/v1/cinemas?limit=5 (200)
- 4711ms — GET /api/v1/dashboard/executive (500)

## Failures

### Movie Ranking

- Method: GET
- URL: /api/v1/movie?top10=true
- Status: 404
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /api/v1/movie?top10=true not found"
  }
}
```

### Dashboard Executive

- Method: GET
- URL: /api/v1/dashboard/executive
- Status: 500
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal Server Error"
  }
}
```

### Dashboard Sales Revenue by Cinema

- Method: GET
- URL: /api/v1/dashboard/sales/revenue-by-cinema
- Status: 500
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal Server Error"
  }
}
```

### Dashboard Films Overview

- Method: GET
- URL: /api/v1/dashboard/films/overview
- Status: 500
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal Server Error"
  }
}
```

