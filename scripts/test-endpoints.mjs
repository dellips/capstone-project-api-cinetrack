import { buildApp } from "../src/app.js";
import { query } from "../src/db.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.resolve(__dirname, "../reports");
const jsonReportPath = path.join(reportsDir, "endpoint-test-results.json");
const markdownReportPath = path.join(reportsDir, "endpoint-test-results.md");

// Mengambil satu contoh id dari tiap tabel agar endpoint detail bisa diuji dengan data nyata.
async function getSampleIds() {
  const statements = {
    movie_id: "SELECT movie_id AS value FROM movies ORDER BY movie_id LIMIT 1",
    cinema_id: "SELECT cinema_id AS value FROM cinema ORDER BY cinema_id LIMIT 1",
    studio_id: "SELECT studio_id AS value FROM studio ORDER BY studio_id LIMIT 1",
    schedule_id: "SELECT schedule_id AS value FROM schedules ORDER BY schedule_id LIMIT 1",
    ticket_id: "SELECT tiket_id AS value FROM tiket ORDER BY tiket_id LIMIT 1"
  };

  const result = {};

  for (const [key, sql] of Object.entries(statements)) {
    const response = await query(sql);
    result[key] = response.rows[0]?.value ?? null;
  }

  return result;
}

// Menyimpan hasil uji endpoint agar laporan akhirnya ringkas dan mudah dibaca.
function createRecorder() {
  const results = [];

  return {
    add(entry) {
      results.push(entry);
    },
    all() {
      return results;
    }
  };
}

// Menentukan apakah status response masih dianggap lolos untuk endpoint tertentu.
function isAcceptedStatus(statusCode, acceptedStatuses = [200]) {
  return acceptedStatuses.includes(statusCode);
}

// Menjalankan satu request inject dan menyimpan ringkasan hasilnya.
async function runCase(app, recorder, {
  name,
  method = "GET",
  url,
  headers,
  payload,
  acceptedStatuses = [200]
}) {
  try {
    const response = await app.inject({
      method,
      url,
      headers,
      payload
    });

    const contentType = response.headers["content-type"] || "";
    const parsedBody = contentType.includes("application/json")
      ? response.json()
      : response.body.slice(0, 120);

    recorder.add({
      name,
      method,
      url,
      statusCode: response.statusCode,
      ok: isAcceptedStatus(response.statusCode, acceptedStatuses),
      acceptedStatuses,
      body: buildBodyPreview(parsedBody)
    });

    return response;
  } catch (error) {
    recorder.add({
      name,
      method,
      url,
      statusCode: 0,
      ok: false,
      acceptedStatuses,
      body: {
        error: error.message
      }
    });

    return null;
  }
}

// Merangkum hasil uji per endpoint supaya cepat dibaca tanpa membuka body penuh satu-satu.
function buildSummary(results) {
  const total = results.length;
  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;

  return {
    total,
    passed,
    failed
  };
}

// Memotong body besar agar file report tetap nyaman dibaca.
function buildBodyPreview(body) {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);

  if (serialized.length <= 3000) {
    return body;
  }

  return `${serialized.slice(0, 3000)}... [truncated]`;
}

// Menyusun laporan markdown ringkas dari hasil pengujian endpoint.
function buildMarkdownReport({ summary, sample_ids, results }) {
  const failures = results.filter((item) => !item.ok);
  const lines = [
    "# Endpoint Test Results",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    "",
    "## Sample IDs",
    "",
    `- movie_id: ${sample_ids.movie_id ?? "-"}`,
    `- cinema_id: ${sample_ids.cinema_id ?? "-"}`,
    `- studio_id: ${sample_ids.studio_id ?? "-"}`,
    `- schedule_id: ${sample_ids.schedule_id ?? "-"}`,
    `- ticket_id: ${sample_ids.ticket_id ?? "-"}`,
    "",
    "## Endpoint Results",
    ""
  ];

  for (const item of results) {
    lines.push(`- [${item.ok ? "PASS" : "FAIL"}] ${item.method} ${item.url} -> ${item.statusCode}`);
  }

  lines.push("");
  lines.push("## Failures");
  lines.push("");

  if (failures.length === 0) {
    lines.push("No failed endpoints.");
  } else {
    for (const item of failures) {
      lines.push(`### ${item.name}`);
      lines.push("");
      lines.push(`- Method: ${item.method}`);
      lines.push(`- URL: ${item.url}`);
      lines.push(`- Status: ${item.statusCode}`);
      lines.push("```json");
      lines.push(JSON.stringify(item.body, null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

// Menulis hasil test ke file JSON dan Markdown agar bisa dipakai ulang.
async function writeReports(payload) {
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(jsonReportPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(markdownReportPath, buildMarkdownReport(payload));
}

// Menjalankan seluruh endpoint unik pada prefix /api/v1 dengan sample data yang tersedia.
async function main() {
  const app = buildApp();
  const recorder = createRecorder();

  await app.ready();

  const sampleIds = await getSampleIds();

  await runCase(app, recorder, {
    name: "Root",
    url: "/api/v1/"
  });

  await runCase(app, recorder, {
    name: "OpenAPI JSON",
    url: "/api/v1/openapi.json"
  });

  await runCase(app, recorder, {
    name: "Docs",
    url: "/api/v1/docs"
  });

  const loginResponse = await runCase(app, recorder, {
    name: "Auth Login",
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "admin@gmail.com",
      password: "admin123"
    }
  });

  const loginBody = loginResponse?.json?.() || null;
  const accessToken = loginBody?.data?.token || null;
  const refreshToken = loginBody?.data?.refresh_token || null;
  const authHeaders = accessToken
    ? {
        authorization: `Bearer ${accessToken}`
      }
    : undefined;

  await runCase(app, recorder, {
    name: "Auth Me",
    url: "/api/v1/auth/me",
    headers: authHeaders
  });

  await runCase(app, recorder, {
    name: "Auth Refresh",
    method: "POST",
    url: "/api/v1/auth/refresh",
    payload: {
      refresh_token: refreshToken
    }
  });

  await runCase(app, recorder, {
    name: "Movies List",
    url: "/api/v1/movies?limit=5"
  });

  if (sampleIds.movie_id) {
    await runCase(app, recorder, {
      name: "Movie Detail",
      url: `/api/v1/movies/${sampleIds.movie_id}`
    });

    await runCase(app, recorder, {
      name: "Movie Performance",
      url: `/api/v1/movies/${sampleIds.movie_id}/performance`
    });
  }

  await runCase(app, recorder, {
    name: "Cinemas List",
    url: "/api/v1/cinemas?limit=5"
  });

  if (sampleIds.cinema_id) {
    await runCase(app, recorder, {
      name: "Cinema Detail",
      url: `/api/v1/cinemas/${sampleIds.cinema_id}`
    });

    await runCase(app, recorder, {
      name: "Cinema Performance",
      url: `/api/v1/cinemas/${sampleIds.cinema_id}/performance`
    });
  }

  await runCase(app, recorder, {
    name: "Studios List",
    url: "/api/v1/studios?limit=5"
  });

  if (sampleIds.studio_id) {
    await runCase(app, recorder, {
      name: "Studio Detail",
      url: `/api/v1/studios/${sampleIds.studio_id}`
    });
  }

  await runCase(app, recorder, {
    name: "Schedules List",
    url: "/api/v1/schedules?limit=5"
  });

  if (sampleIds.schedule_id) {
    await runCase(app, recorder, {
      name: "Schedule Detail",
      url: `/api/v1/schedules/${sampleIds.schedule_id}`
    });
  }

  await runCase(app, recorder, {
    name: "Tikets List",
    url: "/api/v1/tikets?limit=5"
  });

  await runCase(app, recorder, {
    name: "Tickets List",
    url: "/api/v1/tickets?limit=5"
  });

  if (sampleIds.ticket_id) {
    await runCase(app, recorder, {
      name: "Tiket Detail",
      url: `/api/v1/tikets/${sampleIds.ticket_id}`
    });

    await runCase(app, recorder, {
      name: "Ticket Detail",
      url: `/api/v1/tickets/${sampleIds.ticket_id}`
    });
  }

  await runCase(app, recorder, {
    name: "Movie Ranking",
    url: "/api/v1/movie?top10=true"
  });

  await runCase(app, recorder, {
    name: "Stats Summary",
    url: "/api/v1/stats/summary?compare=true"
  });

  await runCase(app, recorder, {
    name: "Stats Trends",
    url: "/api/v1/stats/trends?group_by=daily"
  });

  await runCase(app, recorder, {
    name: "Stats Occupancy",
    url: "/api/v1/stats/occupancy?group_by=daily"
  });

  await runCase(app, recorder, {
    name: "Stats Movie",
    url: "/api/v1/stats/movie"
  });

  await runCase(app, recorder, {
    name: "Stats Cinema",
    url: "/api/v1/stats/cinema"
  });

  await runCase(app, recorder, {
    name: "Dashboard Executive",
    url: "/api/v1/dashboard/executive"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Overview",
    url: "/api/v1/dashboard/sales/overview"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Revenue by Cinema",
    url: "/api/v1/dashboard/sales/revenue-by-cinema"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Revenue by Studio",
    url: "/api/v1/dashboard/sales/revenue-by-studio"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Revenue by Movie",
    url: "/api/v1/dashboard/sales/revenue-by-movie"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Time Slots",
    url: "/api/v1/dashboard/sales/time-slots"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Trend",
    url: "/api/v1/dashboard/sales/trend"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Weekend vs Weekday",
    url: "/api/v1/dashboard/sales/weekend-vs-weekday"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Payment",
    url: "/api/v1/dashboard/sales/payment"
  });

  await runCase(app, recorder, {
    name: "Dashboard Sales Operational Risk",
    url: "/api/v1/dashboard/sales/operational-risk"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Overview",
    url: "/api/v1/dashboard/films/overview"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Performance",
    url: "/api/v1/dashboard/films/performance"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Schedules",
    url: "/api/v1/dashboard/films/schedules"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Occupancy",
    url: "/api/v1/dashboard/films/occupancy"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Distribution",
    url: "/api/v1/dashboard/films/distribution"
  });

  await runCase(app, recorder, {
    name: "Dashboard Films Operational Risk",
    url: "/api/v1/dashboard/films/operational-risk"
  });

  const notificationsResponse = await runCase(app, recorder, {
    name: "Notifications List",
    url: "/api/v1/notifications?limit=5"
  });

  await runCase(app, recorder, {
    name: "Dashboard Notifications",
    url: "/api/v1/dashboard/notifications?limit=5"
  });

  await runCase(app, recorder, {
    name: "Alerts Summary",
    url: "/api/v1/alerts/summary"
  });

  await runCase(app, recorder, {
    name: "Payments Config",
    url: "/api/v1/payments/config"
  });

  await runCase(app, recorder, {
    name: "Cities",
    url: "/api/v1/cities"
  });

  await runCase(app, recorder, {
    name: "System Health",
    url: "/api/v1/system/health",
    acceptedStatuses: [200, 503]
  });

  await runCase(app, recorder, {
    name: "System Status",
    url: "/api/v1/system/status",
    acceptedStatuses: [200, 503]
  });

  await runCase(app, recorder, {
    name: "Analytics Pricing Recommendation",
    url: "/api/v1/analytics/pricing-recommendation"
  });

  await runCase(app, recorder, {
    name: "Analytics Best Ad Slot",
    url: "/api/v1/analytics/best-ad-slot"
  });

  await runCase(app, recorder, {
    name: "Analytics Early Blockbuster",
    url: "/api/v1/analytics/early-blockbuster"
  });

  await runCase(app, recorder, {
    name: "Analytics Cannibalization",
    url: "/api/v1/analytics/cannibalization"
  });

  if (authHeaders) {
    const settingsResponse = await runCase(app, recorder, {
      name: "Settings Get",
      url: "/api/v1/settings",
      headers: authHeaders
    });

    const settings = settingsResponse?.json?.()?.data || {
      theme_default: "system",
      refresh_interval_sec: 60
    };

    await runCase(app, recorder, {
      name: "Settings Patch",
      method: "PATCH",
      url: "/api/v1/settings",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      payload: settings
    });
  }

  const notificationBody = notificationsResponse?.json?.() || null;
  const notificationId = notificationBody?.data?.[0]?.notification_id || null;

  if (notificationId) {
    await runCase(app, recorder, {
      name: "Notification Detail",
      url: `/api/v1/notifications/${notificationId}`
    });

    await runCase(app, recorder, {
      name: "Notification Read",
      method: "PATCH",
      url: `/api/v1/notifications/${notificationId}/read`
    });
  }

  await runCase(app, recorder, {
    name: "Notification Read All",
    method: "PATCH",
    url: "/api/v1/notifications/read-all"
  });

  if (refreshToken) {
    await runCase(app, recorder, {
      name: "Auth Logout",
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: {
        refresh_token: refreshToken
      }
    });
  }

  const results = recorder.all();
  const summary = buildSummary(results);
  const reportPayload = {
    summary,
    sample_ids: sampleIds,
    results
  };

  await writeReports(reportPayload);

  console.log(JSON.stringify(reportPayload, null, 2));
  console.log(`JSON report: ${jsonReportPath}`);
  console.log(`Markdown report: ${markdownReportPath}`);

  await app.close();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
