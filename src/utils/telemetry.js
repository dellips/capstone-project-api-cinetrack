import { AsyncLocalStorage } from "node:async_hooks";

const telemetryContext = new AsyncLocalStorage();

function normalizeSql(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function runWithTelemetryContext(initialState, callback) {
  const baseState = {
    requestId: null,
    method: null,
    url: null,
    queryCount: 0,
    totalQueryMs: 0,
    slowQueries: [],
    ...initialState
  };

  return telemetryContext.run(baseState, callback);
}

export function getTelemetryContext() {
  return telemetryContext.getStore();
}

export function recordQueryMetric(sql, durationMs, rowCount = null) {
  const store = telemetryContext.getStore();
  if (!store) return;

  const safeDuration = Number(durationMs || 0);
  const thresholdMs = Number(process.env.TELEMETRY_SLOW_QUERY_MS || 200);

  store.queryCount += 1;
  store.totalQueryMs += safeDuration;

  if (safeDuration >= thresholdMs) {
    store.slowQueries.push({
      sql: normalizeSql(sql),
      duration_ms: Number(safeDuration.toFixed(2)),
      row_count: Number.isFinite(Number(rowCount)) ? Number(rowCount) : null
    });
  }
}
