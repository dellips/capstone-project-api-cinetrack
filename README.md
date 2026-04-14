# CineTrack API

Fastify-based analytics API for CineTrack dashboards.

## Tech Stack

- Node.js (ESM)
- Fastify
- PostgreSQL (`pg`)
- Redis-backed cache layer

## Required Environment Variables

Create `.env` with:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=your_auth_secret
REDIS_URL=redis://default:password@host:port
AI_API_KEY=your_ai_api_key
AI_BASE_URL=https://your-ai-base-url/v1
AI_MODEL=openai/gpt-5-mini
CACHE_ENABLED=true
CACHE_TTL_SECONDS=120
REDIS_CONNECT_TIMEOUT_MS=5000
CORS_ORIGIN=http://localhost:6000,https://your-frontend-domain.vercel.app
PORT=8000
HOST=0.0.0.0
```

The app loads env files from:

- `./.env`
- `../.env`

## Run Locally

```bash
npm install
npm run dev
```

Production mode:

```bash
npm start
```

## Validation

```bash
node --check src/server.js
```

Run endpoint tests:

```bash
npm run test:endpoints
```

## Base Paths

- Legacy: `/`
- Versioned: `/api/v1`

Recommended frontend API base:

```env
NEXT_PUBLIC_CINETRACK_API_BASE_URL=http://localhost:8000/api/v1
```

## API Docs

- OpenAPI spec: `openapi.json`

## Response Contract

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message"
  }
}
```

## Main Endpoint Groups

- `system`: health and runtime status
- `auth`: login, refresh, logout, profile
- `master data`: movies, cinemas, studios, schedules, tickets
- `stats`: summary, trends, occupancy, movie stats, cinema stats
- `dashboard`: executive, films, sales, notifications
- `analytics`: pricing, ad slots, early blockbuster, cannibalization

## Deployment

Serverless handler entrypoint is `src/app.js` and is compatible with Vercel functions.
