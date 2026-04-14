# Endpoint Test Results

Generated at: 2026-04-14T14:15:11.616Z

## Summary

- Total: 60
- Passed: 36
- Failed: 24

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
- [FAIL] GET /api/v1/dashboard/executive -> 401
- [FAIL] GET /api/v1/dashboard/sales/overview -> 401
- [FAIL] GET /api/v1/dashboard/sales/revenue-by-cinema -> 401
- [FAIL] GET /api/v1/dashboard/sales/revenue-by-studio -> 401
- [FAIL] GET /api/v1/dashboard/sales/revenue-by-movie -> 401
- [FAIL] GET /api/v1/dashboard/sales/time-slots -> 401
- [FAIL] GET /api/v1/dashboard/sales/trend -> 401
- [FAIL] GET /api/v1/dashboard/sales/weekend-vs-weekday -> 401
- [FAIL] GET /api/v1/dashboard/sales/payment -> 401
- [FAIL] GET /api/v1/dashboard/sales/operational-risk -> 401
- [FAIL] GET /api/v1/dashboard/films/overview -> 401
- [FAIL] GET /api/v1/dashboard/films/performance -> 401
- [FAIL] GET /api/v1/dashboard/films/schedules -> 401
- [FAIL] GET /api/v1/dashboard/films/occupancy -> 401
- [FAIL] GET /api/v1/dashboard/films/distribution -> 401
- [FAIL] GET /api/v1/dashboard/films/operational-risk -> 401
- [PASS] GET /api/v1/notifications?limit=5 -> 200
- [FAIL] GET /api/v1/dashboard/notifications?limit=5 -> 401
- [PASS] GET /api/v1/alerts/summary -> 200
- [FAIL] GET /api/v1/payments/config -> 401
- [FAIL] GET /api/v1/cities -> 401
- [PASS] GET /api/v1/system/health -> 200
- [PASS] GET /api/v1/system/status -> 200
- [FAIL] GET /api/v1/analytics/pricing-recommendation -> 401
- [FAIL] GET /api/v1/analytics/best-ad-slot -> 401
- [FAIL] GET /api/v1/analytics/early-blockbuster -> 401
- [FAIL] GET /api/v1/analytics/cannibalization -> 401
- [PASS] GET /api/v1/settings -> 200
- [PASS] PATCH /api/v1/settings -> 200
- [PASS] GET /api/v1/notifications/system-health -> 200
- [PASS] PATCH /api/v1/notifications/system-health/read -> 200
- [PASS] PATCH /api/v1/notifications/read-all -> 200
- [PASS] POST /api/v1/auth/logout -> 200

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
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Overview

- Method: GET
- URL: /api/v1/dashboard/sales/overview
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Revenue by Cinema

- Method: GET
- URL: /api/v1/dashboard/sales/revenue-by-cinema
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Revenue by Studio

- Method: GET
- URL: /api/v1/dashboard/sales/revenue-by-studio
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Revenue by Movie

- Method: GET
- URL: /api/v1/dashboard/sales/revenue-by-movie
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Time Slots

- Method: GET
- URL: /api/v1/dashboard/sales/time-slots
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Trend

- Method: GET
- URL: /api/v1/dashboard/sales/trend
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Weekend vs Weekday

- Method: GET
- URL: /api/v1/dashboard/sales/weekend-vs-weekday
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Payment

- Method: GET
- URL: /api/v1/dashboard/sales/payment
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Sales Operational Risk

- Method: GET
- URL: /api/v1/dashboard/sales/operational-risk
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Overview

- Method: GET
- URL: /api/v1/dashboard/films/overview
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Performance

- Method: GET
- URL: /api/v1/dashboard/films/performance
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Schedules

- Method: GET
- URL: /api/v1/dashboard/films/schedules
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Occupancy

- Method: GET
- URL: /api/v1/dashboard/films/occupancy
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Distribution

- Method: GET
- URL: /api/v1/dashboard/films/distribution
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Films Operational Risk

- Method: GET
- URL: /api/v1/dashboard/films/operational-risk
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Dashboard Notifications

- Method: GET
- URL: /api/v1/dashboard/notifications?limit=5
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Payments Config

- Method: GET
- URL: /api/v1/payments/config
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Cities

- Method: GET
- URL: /api/v1/cities
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Analytics Pricing Recommendation

- Method: GET
- URL: /api/v1/analytics/pricing-recommendation
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Analytics Best Ad Slot

- Method: GET
- URL: /api/v1/analytics/best-ad-slot
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Analytics Early Blockbuster

- Method: GET
- URL: /api/v1/analytics/early-blockbuster
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

### Analytics Cannibalization

- Method: GET
- URL: /api/v1/analytics/cannibalization
- Status: 401
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  }
}
```

