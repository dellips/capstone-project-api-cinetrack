# CineTrack API

Backend dashboard bioskop berbasis `Node.js + Fastify`.

## Menjalankan

1. Install dependency:

```bash
npm install
```

2. Siapkan file `.env`:

```bash
DATABASE_URL=your_database_url
REDIS_URL=redis://default:password@host:port
CACHE_ENABLED=true
CACHE_TTL_SECONDS=120
REDIS_CONNECT_TIMEOUT_MS=5000
CORS_ORIGIN=http://localhost:3000,https://your-frontend-domain.vercel.app
PORT=8000
HOST=0.0.0.0
AUTH_SECRET=your_secret
```

Loader config akan mencoba membaca:
- `./.env`
- `../.env`

`CORS_ORIGIN` menerima daftar origin yang dipisahkan koma. Gunakan `*` bila memang ingin membuka akses ke semua origin.
`REDIS_URL` dipakai untuk cache Redis. Jika kosong, API tetap berjalan tanpa cache.
`CACHE_ENABLED=false` bisa dipakai untuk mematikan cache tanpa menghapus `REDIS_URL`.
`CACHE_TTL_SECONDS` menentukan TTL cache default dalam detik.
`REDIS_CONNECT_TIMEOUT_MS` membatasi waktu tunggu koneksi Redis.

3. Jalankan server:

```bash
npm run dev
```

Atau tanpa watch mode:

```bash
npm start
```

## Base URL

API tersedia di dua jalur:
- Legacy: `/`
- Versioned: `/api/v1`

Saran untuk frontend:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## OpenAPI

Spesifikasi OpenAPI tersedia di [openapi.json](/Users/ninditya/capstone-project-api-cinetrack/openapi.json).

File ini bisa langsung di-import ke:
- [Swagger Editor](https://editor.swagger.io/)
- Swagger UI lokal
- tool generator client seperti `openapi-typescript`

## Format Response

Response sukses:

```json
{
  "success": true,
  "data": {}
}
```

Response sukses dengan metadata:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Response error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message"
  }
}
```

Contoh error validasi:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "body must have required property 'password'",
    "details": [
      {
        "field": "password",
        "message": "must have required property 'password'"
      }
    ]
  }
}
```

## Status Code

- `200` request sukses
- `401` login gagal
- `404` resource tidak ditemukan
- `422` body/query invalid
- `500` server error

## Endpoint

Seluruh endpoint utama tersedia di `/api/v1`.

### System

- `GET /api/v1/`
- `GET /api/v1/system/health`

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Master Data

- `GET /api/v1/movies`
- `GET /api/v1/movies/:movie_id`
- `GET /api/v1/movies/:movie_id/performance`
- `GET /api/v1/cinemas`
- `GET /api/v1/cinemas/:cinema_id`
- `GET /api/v1/cinemas/:cinema_id/performance`
- `GET /api/v1/studios`
- `GET /api/v1/studios/:studio_id`
- `GET /api/v1/schedules`
- `GET /api/v1/schedules/:schedule_id`
- `GET /api/v1/tikets`
- `GET /api/v1/tikets/:tiket_id`

### Analytics

- `GET /api/v1/movie`
- `GET /api/v1/stats/summary`
- `GET /api/v1/stats/trends`
- `GET /api/v1/stats/occupancy`
- `GET /api/v1/stats/movie`
- `GET /api/v1/stats/cinema`

### Notifications

- `GET /api/v1/notifications`
- `GET /api/v1/notifications/:notification_id`
- `PATCH /api/v1/notifications/:notification_id/read`
- `PATCH /api/v1/notifications/read-all`
- `GET /api/v1/alerts/summary`

### Settings

- `GET /api/v1/settings`
- `PATCH /api/v1/settings`

## Query Support

List endpoint sudah mendukung `page` dan `limit`:
- `/movies`
- `/cinemas`
- `/studios`
- `/schedules`
- `/tikets`
- `/notifications`

Filter yang tersedia:
- `/movies`: `search`, `genre`, `rating_usia`
- `/cinemas`: `city`, `cinema_id`
- `/studios`: `cinema_id`, `studio_id`, `screen_type`
- `/schedules`: `movie_id`, `cinema_id`, `studio_id`, `show_date`, `start_date`, `end_date`, `status`
- `/tikets`: `schedule_id`, `movie_id`, `cinema_id`, `payment_type`, `seat_category`, `start_date`, `end_date`
- `/movie`: `top10`, `city`, `cinema_id`, `start_date`, `end_date`
- `/stats/summary`: `start_date`, `end_date`, `period`, `city`, `cinema_id`, `studio_id`, `compare`
- `/stats/trends`: `start_date`, `end_date`, `group_by`, `city`, `cinema_id`, `movie_id`, `studio_id`
- `/stats/occupancy`: `start_date`, `end_date`, `group_by`, `city`, `cinema_id`, `movie_id`, `studio_id`
- `/stats/movie`: `city`, `cinema_id`, `rating_usia`, `start_date`, `end_date`
- `/stats/cinema`: `city`, `cinema_id`, `start_date`, `end_date`
- `/notifications`: `status`, `severity`, `page`, `limit`

## Contoh Request

Health:

```bash
curl http://localhost:8000/api/v1/system/health
```

Login:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@gmail.com","password":"admin123"}'
```

Ranking film:

```bash
curl "http://localhost:8000/api/v1/movie?top10=true&start_date=2026-04-01&end_date=2026-04-07"
```

Summary dashboard:

```bash
curl "http://localhost:8000/api/v1/stats/summary?compare=true"
```

Cinema performance:

```bash
curl "http://localhost:8000/api/v1/cinemas/C001/performance?start_date=2026-04-01&end_date=2026-04-07"
```

Settings:

```bash
curl http://localhost:8000/api/v1/settings \
  -H "Authorization: Bearer <access_token>"
```

## Catatan Implementasi

- Endpoint `settings`, `notifications`, `alerts`, dan refresh-token state memakai penyimpanan file lokal di `src/data/`.
- `GET /system/health` akan mengembalikan `503` bila backend tidak bisa menjangkau database.
- `GET /movies/:movie_id`, `GET /cinemas/:cinema_id`, `GET /studios/:studio_id`, `GET /schedules/:schedule_id`, dan `GET /tikets/:tiket_id` mengembalikan `404` bila data tidak ditemukan.
- Endpoint analytics yang paling berat saat ini adalah `/cinemas`, `/stats/movie`, `/movie`, dan `/notifications`.

## Admin Dashboard Login

Kredensial admin statis:
- `email: admin@gmail.com`
- `password: admin123`

## Deploy ke Vercel

Project mengekspor default handler dari [src/app.js](/Users/ninditya/capstone-project-api-cinetrack/src/app.js) untuk kebutuhan runtime serverless.
