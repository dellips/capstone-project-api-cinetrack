import { formatDateOnly } from "../utils/date.js";
import { getBestAdSlots, getPricingRecommendations, getSalesOverview } from "./dashboard.service.js";
import { generateInsightFromAi } from "../lib/elice-ai.lib.js";
import {
  ensureAiInsightsTable,
  getLatestAiInsightRecord,
  listCinemaScopes,
  listCityScopes,
  listStudioScopes,
  upsertAiInsightRecord
} from "../repositories/ai-insights.repository.js";

function getRolling14DayRange() {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 13);
  startDate.setHours(0, 0, 0, 0);

  return {
    start_date: formatDateOnly(startDate),
    end_date: formatDateOnly(endDate)
  };
}

function roundNumber(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function formatPeriodValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return formatDateOnly(value);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return formatDateOnly(parsed);
  }

  return String(value);
}

function normalizeSummary(data, periodStart, periodEnd) {
  return {
    period_start: periodStart,
    period_end: periodEnd,
    total_tickets: Number(data.total_tickets || 0),
    total_revenue: roundNumber(data.total_revenue || 0),
    avg_ticket_price: roundNumber(data.avg_ticket_price || 0),
    revenue_per_seat: roundNumber(data.revenue_per_seat || 0),
    avg_occupancy: roundNumber(data.avg_occupancy || 0),
    growth: data.growth || {}
  };
}

function normalizeAdScore(data) {
  return {
    summary: data.summary || {},
    top_slots: Array.isArray(data.breakdown) ? data.breakdown.slice(0, 3) : []
  };
}

function normalizePricing(data) {
  return {
    summary: data.summary || {},
    recommendations: Array.isArray(data.recommendations) ? data.recommendations.slice(0, 3) : []
  };
}

function getScopeRequest(input = {}) {
  if (input.studio_id) {
    return {
      scope_type: "studio",
      scope_value: input.studio_id,
      scope_meta: {
        studio_id: input.studio_id
      },
      filters: {
        studio_id: input.studio_id
      }
    };
  }

  if (input.cinema_id) {
    return {
      scope_type: "cinema",
      scope_value: input.cinema_id,
      scope_meta: {
        cinema_id: input.cinema_id
      },
      filters: {
        cinema_id: input.cinema_id
      }
    };
  }

  if (input.city) {
    return {
      scope_type: "city",
      scope_value: input.city,
      scope_meta: {
        city: input.city,
        label: input.city
      },
      filters: {
        city: input.city
      }
    };
  }

  return {
    scope_type: "global",
    scope_value: "",
    scope_meta: {
      label: "Global"
    },
    filters: {}
  };
}

function buildDashboardCards(insight) {
  return {
    headline: insight.title || null,
    summary: insight.description || null,
    recommendation: insight.recommendation || null,
    impact_level: insight.impact_level || null,
    category: insight.category || null
  };
}

function mapRecordToResponse(record) {
  const insight = record.ai_payload?.insight || {};
  const scopeMeta = record.scope_meta || {};
  const periodStart = formatPeriodValue(record.period_start || record.summary_snapshot?.period_start);
  const periodEnd = formatPeriodValue(record.period_end || record.summary_snapshot?.period_end);
  const actionItems = Array.isArray(record.action_items) ? record.action_items : (insight.action_items || []);

  return {
    scope: {
      type: record.scope_type,
      value: record.scope_value || null,
      label: scopeMeta.label || scopeMeta.cinema_name || scopeMeta.studio_name || scopeMeta.city || "Global",
      city: scopeMeta.city || null,
      cinema_id: scopeMeta.cinema_id || null,
      cinema_name: scopeMeta.cinema_name || null,
      studio_id: scopeMeta.studio_id || null,
      studio_name: scopeMeta.studio_name || null
    },
    period: {
      start_date: periodStart,
      end_date: periodEnd,
      label: `${periodStart} to ${periodEnd}`
    },
    generated_at: record.updated_at,
    ai_source: record.ai_source || "unknown",
    ai_model: record.ai_model || null,
    cards: buildDashboardCards(insight),
    metrics: record.summary_snapshot || {},
    highlights: {
      top_ad_slots: record.ad_score_snapshot?.top_slots || [],
      pricing_recommendations: record.pricing_snapshot?.recommendations || []
    },
    analysis: {
      title: record.title || insight.title || null,
      description: record.description || insight.description || null,
      recommendation: record.recommendation || insight.recommendation || null,
      action_items: actionItems,
      impact_level: record.impact_level || insight.impact_level || null,
      category: record.category || insight.category || null
    },
    action_items: actionItems
  };
}

async function buildAndSaveScopeInsight(scope) {
  const range = getRolling14DayRange();
  const filters = {
    start_date: range.start_date,
    end_date: range.end_date,
    period: "daily",
    ...scope.filters
  };

  const [salesOverview, adScore, pricing] = await Promise.all([
    getSalesOverview(filters),
    getBestAdSlots({ ...filters, top_n: 3 }),
    getPricingRecommendations({ ...filters, top_n: 3 })
  ]);

  const summary = normalizeSummary(salesOverview, range.start_date, range.end_date);
  const adScoreSnapshot = normalizeAdScore(adScore);
  const pricingSnapshot = normalizePricing(pricing);

  const aiPayload = await generateInsightFromAi({
    scope: {
      scope_type: scope.scope_type,
      scope_value: scope.scope_value
    },
    summary,
    ad_score: adScoreSnapshot,
    pricing_recommendation: pricingSnapshot
  });

  const saved = await upsertAiInsightRecord({
    scope_type: scope.scope_type,
    scope_value: scope.scope_value || "",
    scope_meta: scope.scope_meta || {},
    period_start: range.start_date,
    period_end: range.end_date,
    summary_snapshot: summary,
    ad_score_snapshot: adScoreSnapshot,
    pricing_snapshot: pricingSnapshot,
    ai_payload: aiPayload
  });

  return mapRecordToResponse(saved);
}

export async function generateAiInsight(body = {}) {
  await ensureAiInsightsTable();
  return buildAndSaveScopeInsight(getScopeRequest(body));
}

export async function generateAiInsightCronBatch() {
  await ensureAiInsightsTable();

  const [cityScopes, cinemaScopes, studioScopes] = await Promise.all([
    listCityScopes(),
    listCinemaScopes(),
    listStudioScopes()
  ]);

  const scopes = [
    {
      scope_type: "global",
      scope_value: "",
      scope_meta: {
        label: "Global"
      },
      filters: {}
    },
    ...cityScopes,
    ...cinemaScopes,
    ...studioScopes
  ];

  const breakdown = {
    global: null,
    cities: [],
    cinemas: [],
    studios: []
  };

  let generatedCount = 0;

  for (const scope of scopes) {
    try {
      const item = await buildAndSaveScopeInsight(scope);
      generatedCount += 1;

      if (item.scope.type === "global") {
        breakdown.global = item;
      } else if (item.scope.type === "city") {
        breakdown.cities.push(item);
      } else if (item.scope.type === "cinema") {
        breakdown.cinemas.push(item);
      } else if (item.scope.type === "studio") {
        breakdown.studios.push(item);
      }
    } catch {
      continue;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    generated_count: generatedCount,
    counts: {
      global: breakdown.global ? 1 : 0,
      cities: breakdown.cities.length,
      cinemas: breakdown.cinemas.length,
      studios: breakdown.studios.length
    },
    breakdown
  };
}

export async function getLatestAiInsight(query = {}) {
  await ensureAiInsightsTable();
  const scope = getScopeRequest(query);
  const record = await getLatestAiInsightRecord({
    scope_type: scope.scope_type,
    scope_value: scope.scope_value || ""
  });
  return mapRecordToResponse(record);
}
