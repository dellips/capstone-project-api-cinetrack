# Fastify Migration

Backend ini adalah hasil migrasi dari API Python/FastAPI ke `Node.js + Fastify`.

## Menjalankan

1. Install dependency:

```bash
npm install
```

2. Siapkan environment:

```bash
cp .env.example .env
```

Atau gunakan `DATABASE_URL` dari folder project utama. Loader config di project ini akan mencoba membaca:
- `node-fastify-api/.env`
- `../.env`

3. Jalankan server:

```bash
npm run dev
```

## Deploy ke Vercel

Project ini sudah mengekspor default handler dari [src/app.js](/C:/Users/user/Documents/KADA%20BATCH%203%202026/node-fastify-api/src/app.js) untuk runtime serverless Vercel.

Jika konfigurasi project Vercel menunjuk ke file app sebagai entry function, gunakan module tersebut sebagai handler.

## Endpoint

API yang tersedia:
- `GET /`
- `GET /movies`
- `GET /studios`
- `GET /schedules`
- `GET /tikets`
- `GET /movie`
  - Optional query: `top10=true`
  - Optional query: `city=<city>`
  - Optional query: `cinema_id=<cinema_id>`
- `GET /cinemas`
  - Optional query: `city=<city>`
  - Optional query: `cinema_id=<cinema_id>`
- `GET /movies/:movie_id`
- `GET /stats/summary`
  - Optional query: `start_date`, `end_date`, `period`, `city`, `cinema_id`, `studio_id`, `compare`
- `GET /stats/trends`
  - Optional query: `start_date`, `end_date`, `group_by`, `city`, `cinema_id`, `movie_id`, `studio_id`
- `GET /stats/occupancy`
  - Optional query: `start_date`, `end_date`, `group_by`, `city`, `cinema_id`, `movie_id`, `studio_id`
- `GET /stats/movie`
  - Optional query: `city`, `cinema_id`, `rating_usia`
- `GET /system/health`
