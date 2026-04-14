import { query } from "../db.js";
import { createHttpError } from "../utils/http-error.js";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ai_insights (
    id BIGSERIAL PRIMARY KEY,
    scope_type TEXT NOT NULL DEFAULT 'global',
    scope_value TEXT NOT NULL DEFAULT '',
    scope_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    summary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ad_score_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    title TEXT NULL,
    description TEXT NULL,
    recommendation TEXT NULL,
    action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    impact_level TEXT NULL,
    category TEXT NULL,
    ai_source TEXT NULL,
    ai_model TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const ALTER_COLUMNS_SQL = [
  "ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS scope_value TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS scope_meta JSONB NOT NULL DEFAULT '{}'::jsonb"
];

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS ai_insights_scope_period_idx
  ON ai_insights (scope_type, scope_value, period_end DESC, updated_at DESC)
`;

const CREATE_UNIQUE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS ai_insights_scope_unique_idx
  ON ai_insights (scope_type, scope_value, period_start, period_end)
`;

const DROP_LEGACY_CONSTRAINTS_SQL = [
  "ALTER TABLE ai_insights DROP CONSTRAINT IF EXISTS ai_insights_scope_type_period_start_period_end_key",
  "DROP INDEX IF EXISTS ai_insights_scope_type_period_start_period_end_key"
];

export async function ensureAiInsightsTable() {
  await query(CREATE_TABLE_SQL);

  for (const statement of ALTER_COLUMNS_SQL) {
    await query(statement);
  }

  for (const statement of DROP_LEGACY_CONSTRAINTS_SQL) {
    await query(statement);
  }

  await query(`UPDATE ai_insights SET scope_value = '' WHERE scope_value IS NULL`);
  await query(CREATE_INDEX_SQL);
  await query(CREATE_UNIQUE_INDEX_SQL);
}

export async function upsertAiInsightRecord({
  scope_type = "global",
  scope_value = "",
  scope_meta = {},
  period_start,
  period_end,
  summary_snapshot,
  ad_score_snapshot,
  pricing_snapshot,
  ai_payload
}) {
  const insight = ai_payload?.insight || {};

  const result = await query(
    `INSERT INTO ai_insights (
      scope_type,
      scope_value,
      scope_meta,
      period_start,
      period_end,
      summary_snapshot,
      ad_score_snapshot,
      pricing_snapshot,
      ai_payload,
      title,
      description,
      recommendation,
      action_items,
      impact_level,
      category,
      ai_source,
      ai_model
    )
    VALUES (
      $1,
      $2,
      $3::jsonb,
      CAST($4 AS DATE),
      CAST($5 AS DATE),
      $6::jsonb,
      $7::jsonb,
      $8::jsonb,
      $9::jsonb,
      $10,
      $11,
      $12,
      $13::jsonb,
      $14,
      $15,
      $16,
      $17
    )
    ON CONFLICT (scope_type, scope_value, period_start, period_end)
    DO UPDATE SET
      scope_meta = EXCLUDED.scope_meta,
      summary_snapshot = EXCLUDED.summary_snapshot,
      ad_score_snapshot = EXCLUDED.ad_score_snapshot,
      pricing_snapshot = EXCLUDED.pricing_snapshot,
      ai_payload = EXCLUDED.ai_payload,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      recommendation = EXCLUDED.recommendation,
      action_items = EXCLUDED.action_items,
      impact_level = EXCLUDED.impact_level,
      category = EXCLUDED.category,
      ai_source = EXCLUDED.ai_source,
      ai_model = EXCLUDED.ai_model,
      updated_at = NOW()
    RETURNING *`,
    [
      scope_type,
      scope_value || "",
      JSON.stringify(scope_meta || {}),
      period_start,
      period_end,
      JSON.stringify(summary_snapshot || {}),
      JSON.stringify(ad_score_snapshot || {}),
      JSON.stringify(pricing_snapshot || {}),
      JSON.stringify(ai_payload || {}),
      insight.title || null,
      insight.description || null,
      insight.recommendation || null,
      JSON.stringify(Array.isArray(insight.action_items) ? insight.action_items : []),
      insight.impact_level || null,
      insight.category || null,
      ai_payload?.source || null,
      ai_payload?.model || null
    ]
  );

  return result.rows[0];
}

export async function getLatestAiInsightRecord({ scope_type = "global", scope_value = "" } = {}) {
  const result = await query(
    `SELECT *
    FROM ai_insights
    WHERE scope_type = $1
      AND scope_value = $2
    ORDER BY period_end DESC, updated_at DESC, id DESC
    LIMIT 1`,
    [scope_type, scope_value || ""]
  );

  if (!result.rows[0]) {
    throw createHttpError(404, "AI insight not found", "NOT_FOUND");
  }

  return result.rows[0];
}

export async function listLatestAiInsightRecords({ scope_type = null, page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 50)));
  const offset = (safePage - 1) * safeLimit;

  const rowsResult = await query(
    `WITH latest_per_scope AS (
      SELECT DISTINCT ON (scope_type, scope_value) *
      FROM ai_insights
      WHERE ($1::text IS NULL OR scope_type = $1)
      ORDER BY scope_type, scope_value, period_end DESC, updated_at DESC, id DESC
    )
    SELECT *
    FROM latest_per_scope
    ORDER BY updated_at DESC, scope_type ASC, scope_value ASC
    LIMIT $2 OFFSET $3`,
    [scope_type, safeLimit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
    FROM (
      SELECT DISTINCT ON (scope_type, scope_value) id
      FROM ai_insights
      WHERE ($1::text IS NULL OR scope_type = $1)
      ORDER BY scope_type, scope_value, period_end DESC, updated_at DESC, id DESC
    ) latest_scopes`,
    [scope_type]
  );

  return {
    rows: rowsResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    limit: safeLimit
  };
}

export async function listAiInsightHistoryRecords({
  scope_type = null,
  scope_value = "",
  useScopeValue = false,
  start_date = null,
  end_date = null,
  page = 1,
  limit = 50
} = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 50)));
  const offset = (safePage - 1) * safeLimit;
  const params = [scope_type, useScopeValue ? scope_value : null, start_date, end_date, safeLimit, offset];

  const rowsResult = await query(
    `SELECT *
    FROM ai_insights
    WHERE ($1::text IS NULL OR scope_type = $1)
      AND ($2::text IS NULL OR scope_value = $2)
      AND ($3::date IS NULL OR period_start >= CAST($3 AS DATE))
      AND ($4::date IS NULL OR period_end <= CAST($4 AS DATE))
    ORDER BY period_end DESC, updated_at DESC, id DESC
    LIMIT $5 OFFSET $6`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
    FROM ai_insights
    WHERE ($1::text IS NULL OR scope_type = $1)
      AND ($2::text IS NULL OR scope_value = $2)
      AND ($3::date IS NULL OR period_start >= CAST($3 AS DATE))
      AND ($4::date IS NULL OR period_end <= CAST($4 AS DATE))`,
    params.slice(0, 4)
  );

  return {
    rows: rowsResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    limit: safeLimit
  };
}

export async function listCityScopes() {
  const result = await query(
    `SELECT DISTINCT city
    FROM cinema
    WHERE city IS NOT NULL AND city <> ''
    ORDER BY city`
  );

  return result.rows.map((row) => ({
    scope_type: "city",
    scope_value: row.city,
    scope_meta: {
      city: row.city,
      label: row.city
    },
    filters: {
      city: row.city
    }
  }));
}

export async function listCinemaScopes() {
  const result = await query(
    `SELECT cinema_id, cinema_name, city
    FROM cinema
    ORDER BY cinema_id`
  );

  return result.rows.map((row) => ({
    scope_type: "cinema",
    scope_value: row.cinema_id,
    scope_meta: {
      cinema_id: row.cinema_id,
      cinema_name: row.cinema_name,
      city: row.city,
      label: row.cinema_name || row.cinema_id
    },
    filters: {
      cinema_id: row.cinema_id
    }
  }));
}

export async function listStudioScopes() {
  const result = await query(
    `SELECT
      st.studio_id,
      st.studio_name,
      st.cinema_id,
      c.cinema_name,
      c.city
    FROM studio st
    JOIN cinema c ON st.cinema_id = c.cinema_id
    ORDER BY st.studio_id`
  );

  return result.rows.map((row) => ({
    scope_type: "studio",
    scope_value: row.studio_id,
    scope_meta: {
      studio_id: row.studio_id,
      studio_name: row.studio_name,
      cinema_id: row.cinema_id,
      cinema_name: row.cinema_name,
      city: row.city,
      label: row.studio_name || row.studio_id
    },
    filters: {
      studio_id: row.studio_id
    }
  }));
}

export async function listStudioInventory({ city = null, cinema_id = null, studio_id = null } = {}) {
  const params = [];
  const conditions = [];

  if (city) {
    params.push(city);
    conditions.push(`c.city = $${params.length}`);
  }

  if (cinema_id) {
    params.push(cinema_id);
    conditions.push(`st.cinema_id = $${params.length}`);
  }

  if (studio_id) {
    params.push(studio_id);
    conditions.push(`st.studio_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT
      st.studio_id,
      st.studio_name,
      st.total_capacity,
      st.cinema_id,
      c.cinema_name,
      c.city
    FROM studio st
    JOIN cinema c ON st.cinema_id = c.cinema_id
    ${whereClause}
    ORDER BY c.city, c.cinema_name, st.total_capacity DESC, st.studio_name ASC`,
    params
  );

  return result.rows.map((row) => ({
    studio_id: row.studio_id,
    studio_name: row.studio_name,
    total_capacity: Number(row.total_capacity || 0),
    cinema_id: row.cinema_id,
    cinema_name: row.cinema_name,
    city: row.city
  }));
}
