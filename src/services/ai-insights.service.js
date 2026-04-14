import { formatDateOnly } from "../utils/date.js";
import {
  getBestAdSlots,
  getFilmsSchedules,
  getPricingRecommendations,
  getSalesOverview,
  getSalesRevenueByStudio,
  getSalesTimeSlots
} from "./dashboard.service.js";
import { generateInsightFromAi } from "../lib/elice-ai.lib.js";
import {
  ensureAiInsightsTable,
  getLatestAiInsightRecord,
  listAiInsightHistoryRecords,
  listCinemaScopes,
  listCityScopes,
  listLatestAiInsightRecords,
  listStudioInventory,
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
    top_slots: Array.isArray(data.breakdown)
      ? data.breakdown.slice(0, 3).map((item) => ({
          title: item.title,
          genre: item.genre,
          time_slot: item.time_slot,
          total_shows: item.total_shows,
          audience_size: item.audience_size,
          total_revenue: item.total_revenue,
          revenue_per_show: item.revenue_per_show,
          occupancy: item.occupancy,
          ad_score: item.ad_score,
          is_rule_based: item.is_rule_based,
          is_proxy_metric: item.is_proxy_metric
        }))
      : []
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

async function enrichScope(scope) {
  if (scope.scope_type === "global") {
    return scope;
  }

  if (scope.scope_type === "city") {
    return {
      ...scope,
      scope_meta: {
        city: scope.scope_value,
        label: scope.scope_value
      }
    };
  }

  if (scope.scope_type === "cinema") {
    const cinemas = await listCinemaScopes();
    const matched = cinemas.find((item) => item.scope_value === scope.scope_value);

    if (!matched) {
      return scope;
    }

    return {
      ...scope,
      scope_meta: matched.scope_meta,
      filters: matched.filters
    };
  }

  if (scope.scope_type === "studio") {
    const studios = await listStudioScopes();
    const matched = studios.find((item) => item.scope_value === scope.scope_value);

    if (!matched) {
      return scope;
    }

    return {
      ...scope,
      scope_meta: matched.scope_meta,
      filters: matched.filters
    };
  }

  return scope;
}

function pickPriority(impact) {
  if (impact >= 85) {
    return "high";
  }

  if (impact >= 60) {
    return "medium";
  }

  return "low";
}

function toActionBadge(actionType) {
  if (actionType === "move_to_larger_studio") {
    return { color: "blue", icon: "move-right" };
  }

  if (actionType === "reduce_showtimes") {
    return { color: "red", icon: "minus-circle" };
  }

  if (actionType === "promotion_opportunity") {
    return { color: "yellow", icon: "badge-percent" };
  }

  if (actionType === "premium_pricing") {
    return { color: "green", icon: "trending-up" };
  }

  return { color: "slate", icon: "lightbulb" };
}

function buildActionCard(action) {
  const badge = toActionBadge(action.action_type);

  return {
    ...action,
    color: badge.color,
    icon: badge.icon
  };
}

function pickTopMovieTitle(adScoreSnapshot) {
  return adScoreSnapshot?.top_slots?.[0]?.title || null;
}

function buildScopeLabel(scopeMeta = {}, scopeType = "global") {
  if (scopeType === "studio") {
    return scopeMeta.studio_name || scopeMeta.label || "Studio";
  }

  if (scopeType === "cinema") {
    return scopeMeta.cinema_name || scopeMeta.label || "Cinema";
  }

  if (scopeType === "city") {
    return scopeMeta.city || scopeMeta.label || "City";
  }

  return scopeMeta.label || "Global";
}

function inferOperationalTheme(summary, candidates = []) {
  const topCandidate = candidates[0];

  if (topCandidate?.action_type === "move_to_larger_studio") {
    return "capacity";
  }

  if (topCandidate?.action_type === "promotion_opportunity") {
    return "promotion";
  }

  if (topCandidate?.action_type === "premium_pricing") {
    return "pricing";
  }

  if (Number(summary.avg_occupancy || 0) < 35) {
    return "occupancy";
  }

  if (Number(summary.growth?.revenue || 0) < 0 || Number(summary.growth?.tickets || 0) < 0) {
    return "growth";
  }

  return "revenue";
}

function buildFallbackRecommendedActions(candidateActions = []) {
  return candidateActions.slice(0, 3).map((item) => buildActionCard(item));
}

function buildFallbackInsight(summary, scope, candidateActions = []) {
  const scopeLabel = buildScopeLabel(scope.scope_meta, scope.scope_type);
  const occupancy = Number(summary.avg_occupancy || 0);
  const revenueGrowth = Number(summary.growth?.revenue || 0);
  const ticketGrowth = Number(summary.growth?.tickets || 0);
  const recommendedActions = buildFallbackRecommendedActions(candidateActions);
  const topAction = recommendedActions[0];

  if (topAction) {
    return {
      title: `${scopeLabel} needs an operational adjustment`,
      description: topAction.description,
      recommendation: topAction.reason,
      action_items: recommendedActions.map((item) => item.title),
      impact_level: topAction.priority === "high" ? "high" : (topAction.priority === "medium" ? "medium" : "low"),
      category: inferOperationalTheme(summary, recommendedActions),
      recommended_actions: recommendedActions
    };
  }

  if (occupancy < 35) {
    return {
      title: `${scopeLabel} needs immediate showtime optimization`,
      description: `The last 14 days show average occupancy at ${roundNumber(occupancy)}%, which indicates underused capacity.`,
      recommendation: "Reduce weak showtimes, move strong titles into better sessions, and tighten studio allocation.",
      action_items: [
        "Review the weakest sessions and reduce frequency where needed.",
        "Protect the strongest titles and prime time sessions.",
        "Use promotions only on sessions with persistent low demand."
      ],
      impact_level: "high",
      category: "occupancy",
      recommended_actions: []
    };
  }

  if (revenueGrowth < 0 || ticketGrowth < 0) {
    return {
      title: `${scopeLabel} is showing softer demand`,
      description: `Ticket growth is ${roundNumber(ticketGrowth)}% and revenue growth is ${roundNumber(revenueGrowth)}% across the last 14 days.`,
      recommendation: "Refresh commercial actions, focus capacity on proven demand, and cut weak showtimes.",
      action_items: [
        "Evaluate campaign performance in the weakest sessions.",
        "Test selective incentives only where conversion is consistently weak.",
        "Shift capacity toward stronger time windows."
      ],
      impact_level: "medium",
      category: "growth",
      recommended_actions: []
    };
  }

  return {
    title: `${scopeLabel} is stable with room to monetize stronger demand`,
    description: `Revenue and ticket performance are stable across the last 14 days, with average occupancy at ${roundNumber(occupancy)}%.`,
    recommendation: "Protect high-performing sessions and test targeted pricing or promotional actions on the best opportunities.",
    action_items: [
      "Maintain the strongest sessions and avoid unnecessary price cuts.",
      "Test premium pricing only on the most resilient demand windows.",
      "Monitor occupancy shifts before expanding schedule volume."
    ],
    impact_level: "medium",
    category: "revenue",
    recommended_actions: []
  };
}

function normalizeCandidateActions(candidateActions = []) {
  return candidateActions
    .filter(Boolean)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 6)
    .map((item) => ({
      action_type: item.action_type,
      priority: item.priority,
      title: item.title,
      description: item.description,
      reason: item.reason,
      expected_impact: item.expected_impact,
      city: item.city || null,
      cinema_name: item.cinema_name || null,
      studio_name: item.studio_name || null,
      movie_title: item.movie_title || null,
      schedule_time: item.schedule_time || null,
      occupancy: item.occupancy != null ? roundNumber(item.occupancy) : null,
      score: roundNumber(item.score || 0),
      color: item.color || toActionBadge(item.action_type).color,
      icon: item.icon || toActionBadge(item.action_type).icon
    }));
}

function buildStudioMetaMap(studioInventory = []) {
  return new Map(
    studioInventory.map((item) => [
      item.studio_id,
      {
        ...item
      }
    ])
  );
}

function enrichScheduleRows(scheduleRows = [], studioMetaMap) {
  return scheduleRows.map((item) => {
    const studioMeta = studioMetaMap.get(item.studio_id) || {};

    return {
      ...item,
      studio_name: studioMeta.studio_name || item.studio_id,
      cinema_name: studioMeta.cinema_name || item.cinema_id,
      city: studioMeta.city || null,
      total_capacity: Number(studioMeta.total_capacity || 0)
    };
  });
}

function buildMoveToLargerStudioCandidates(scheduleRows = [], studioBreakdown = [], studioMetaMap) {
  const studioStatsById = new Map(studioBreakdown.map((item) => [item.studio_id, item]));
  const cinemaStudios = new Map();

  for (const studio of studioMetaMap.values()) {
    const list = cinemaStudios.get(studio.cinema_id) || [];
    list.push(studio);
    cinemaStudios.set(studio.cinema_id, list);
  }

  const candidates = [];

  for (const schedule of scheduleRows) {
    if (Number(schedule.occupancy || 0) < 82) {
      continue;
    }

    const currentStudio = studioMetaMap.get(schedule.studio_id);

    if (!currentStudio || currentStudio.total_capacity <= 0) {
      continue;
    }

    const alternatives = (cinemaStudios.get(currentStudio.cinema_id) || [])
      .filter((item) => item.studio_id !== currentStudio.studio_id && item.total_capacity > currentStudio.total_capacity)
      .map((item) => ({
        ...item,
        aggregate: studioStatsById.get(item.studio_id)
      }))
      .filter((item) => Number(item.aggregate?.occupancy || 0) <= 60)
      .sort((left, right) => left.aggregate.occupancy - right.aggregate.occupancy || right.total_capacity - left.total_capacity);

    const target = alternatives[0];

    if (!target) {
      continue;
    }

    const score = Number(schedule.occupancy || 0) + Math.max(0, target.total_capacity - currentStudio.total_capacity);
    const priority = pickPriority(score);

    candidates.push({
      action_type: "move_to_larger_studio",
      priority,
      title: `Move ${schedule.title} to ${target.studio_name}`,
      description: `${schedule.title} at ${schedule.start_time} in ${schedule.cinema_name} is regularly filling ${currentStudio.studio_name}, while ${target.studio_name} has spare capacity.`,
      reason: `Average occupancy for this session is ${roundNumber(schedule.occupancy)}%, and ${target.studio_name} is a larger studio with weaker aggregate utilization.`,
      expected_impact: "Capture unmet demand and reduce sellout risk on high-performing sessions.",
      city: schedule.city,
      cinema_name: schedule.cinema_name,
      studio_name: target.studio_name,
      movie_title: schedule.title,
      schedule_time: String(schedule.start_time || "").slice(0, 5),
      occupancy: schedule.occupancy,
      score
    });
  }

  return candidates;
}

function buildReduceShowtimesCandidates(scheduleRows = []) {
  return scheduleRows
    .filter((item) => Number(item.occupancy || 0) <= 22 && Number(item.total_tickets || 0) <= 25)
    .sort((left, right) => Number(left.occupancy || 0) - Number(right.occupancy || 0) || Number(left.revenue || 0) - Number(right.revenue || 0))
    .slice(0, 4)
    .map((item) => {
      const score = (100 - Number(item.occupancy || 0)) + Math.max(0, 30 - Number(item.total_tickets || 0));
      const priority = pickPriority(score);

      return {
        action_type: "reduce_showtimes",
        priority,
        title: `Reduce the ${String(item.start_time || "").slice(0, 5)} show for ${item.title}`,
        description: `${item.title} is consistently underperforming in ${item.cinema_name} at ${String(item.start_time || "").slice(0, 5)}.`,
        reason: `The session is running at only ${roundNumber(item.occupancy)}% occupancy with ${Number(item.total_tickets || 0)} tickets sold over the observed pattern.`,
        expected_impact: "Free up capacity for stronger titles or stronger time windows.",
        city: item.city,
        cinema_name: item.cinema_name,
        studio_name: item.studio_name,
        movie_title: item.title,
        schedule_time: String(item.start_time || "").slice(0, 5),
        occupancy: item.occupancy,
        score
      };
    });
}

function buildPromotionCandidates(scheduleRows = [], pricingRecommendations = []) {
  const discountSlots = pricingRecommendations
    .filter((item) => item.suggested_action === "discount_or_reduce_slot")
    .map((item) => item.time_slot);

  return scheduleRows
    .filter((item) => discountSlots.includes(String(item.start_time || "").slice(0, 5)) && Number(item.occupancy || 0) > 20 && Number(item.occupancy || 0) <= 45)
    .sort((left, right) => Number(left.occupancy || 0) - Number(right.occupancy || 0))
    .slice(0, 4)
    .map((item) => {
      const score = 75 - Number(item.occupancy || 0);
      const priority = pickPriority(score);

      return {
        action_type: "promotion_opportunity",
        priority,
        title: `Run a targeted promo for ${item.title} at ${String(item.start_time || "").slice(0, 5)}`,
        description: `${item.title} has recoverable demand in ${item.cinema_name}, but the current session still under-converts.`,
        reason: `The slot is only reaching ${roundNumber(item.occupancy)}% occupancy, which fits the low-conversion window highlighted by pricing analysis.`,
        expected_impact: "Lift utilization in weak sessions without cutting stronger showtimes.",
        city: item.city,
        cinema_name: item.cinema_name,
        studio_name: item.studio_name,
        movie_title: item.title,
        schedule_time: String(item.start_time || "").slice(0, 5),
        occupancy: item.occupancy,
        score
      };
    });
}

function buildPremiumPricingCandidates(scheduleRows = [], pricingRecommendations = []) {
  const premiumSlots = pricingRecommendations
    .filter((item) => item.suggested_action === "increase_price")
    .map((item) => item.time_slot);

  return scheduleRows
    .filter((item) => premiumSlots.includes(String(item.start_time || "").slice(0, 5)) && Number(item.occupancy || 0) >= 78)
    .sort((left, right) => Number(right.occupancy || 0) - Number(left.occupancy || 0))
    .slice(0, 3)
    .map((item) => {
      const score = Number(item.occupancy || 0) + 12;
      const priority = pickPriority(score);

      return {
        action_type: "premium_pricing",
        priority,
        title: `Test a premium price for ${item.title} at ${String(item.start_time || "").slice(0, 5)}`,
        description: `${item.title} is already winning in ${item.cinema_name} during this slot.`,
        reason: `The session is sustaining ${roundNumber(item.occupancy)}% occupancy, which indicates pricing headroom on a resilient time window.`,
        expected_impact: "Increase revenue yield without adding more schedule volume.",
        city: item.city,
        cinema_name: item.cinema_name,
        studio_name: item.studio_name,
        movie_title: item.title,
        schedule_time: String(item.start_time || "").slice(0, 5),
        occupancy: item.occupancy,
        score
      };
    });
}

function deduplicateCandidateActions(candidateActions = []) {
  const unique = new Map();

  for (const item of candidateActions) {
    const key = [
      item.action_type,
      item.city || "",
      item.cinema_name || "",
      item.studio_name || "",
      item.movie_title || "",
      item.schedule_time || ""
    ].join("|");

    if (!unique.has(key) || Number(item.score || 0) > Number(unique.get(key).score || 0)) {
      unique.set(key, item);
    }
  }

  return Array.from(unique.values());
}

async function buildCandidateActions(filters, scope) {
  const [studioInventory, studioRevenue, filmsSchedules, pricing] = await Promise.all([
    listStudioInventory(filters),
    getSalesRevenueByStudio(filters),
    getFilmsSchedules(filters),
    getPricingRecommendations({ ...filters, top_n: 5 })
  ]);

  const studioMetaMap = buildStudioMetaMap(studioInventory);
  const scheduleRows = enrichScheduleRows(filmsSchedules.schedule_performance || [], studioMetaMap);
  const studioBreakdown = Array.isArray(studioRevenue.breakdown) ? studioRevenue.breakdown : [];
  const pricingRecommendations = Array.isArray(pricing.recommendations) ? pricing.recommendations : [];

  const moveCandidates = buildMoveToLargerStudioCandidates(scheduleRows, studioBreakdown, studioMetaMap);
  const reduceCandidates = buildReduceShowtimesCandidates(scheduleRows);
  const promoCandidates = buildPromotionCandidates(scheduleRows, pricingRecommendations);
  const premiumCandidates = buildPremiumPricingCandidates(scheduleRows, pricingRecommendations);

  return normalizeCandidateActions(
    deduplicateCandidateActions([
      ...moveCandidates,
      ...reduceCandidates,
      ...promoCandidates,
      ...premiumCandidates
    ])
  ).map((item) => ({
    ...item,
    scope_label: buildScopeLabel(scope.scope_meta, scope.scope_type)
  }));
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

function mapRecommendedActions(insight = {}) {
  return Array.isArray(insight.recommended_actions)
    ? insight.recommended_actions.map((item) => buildActionCard(item))
    : [];
}

function mapRecordToResponse(record) {
  const insight = record.ai_payload?.insight || {};
  const scopeMeta = record.scope_meta || {};
  const periodStart = formatPeriodValue(record.period_start || record.summary_snapshot?.period_start);
  const periodEnd = formatPeriodValue(record.period_end || record.summary_snapshot?.period_end);
  const actionItems = Array.isArray(record.action_items) ? record.action_items : (insight.action_items || []);
  const recommendedActions = mapRecommendedActions(insight);

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
    summary: record.summary_snapshot || {},
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
    recommended_actions: recommendedActions,
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

  const [salesOverview, adScore, pricing, timeSlots, candidateActions] = await Promise.all([
    getSalesOverview(filters),
    getBestAdSlots({ ...filters, top_n: 3 }),
    getPricingRecommendations({ ...filters, top_n: 3 }),
    getSalesTimeSlots(filters),
    buildCandidateActions(filters, scope)
  ]);

  const summary = normalizeSummary(salesOverview, range.start_date, range.end_date);
  const adScoreSnapshot = normalizeAdScore(adScore);
  const pricingSnapshot = normalizePricing(pricing);

  const fallbackInsight = buildFallbackInsight(summary, scope, candidateActions);
  const aiPayload = await generateInsightFromAi(
    {
      scope: {
        scope_type: scope.scope_type,
        scope_value: scope.scope_value,
        scope_label: buildScopeLabel(scope.scope_meta, scope.scope_type),
        scope_meta: scope.scope_meta || {}
      },
      summary,
      ad_score: adScoreSnapshot,
      pricing_recommendation: pricingSnapshot,
      time_slots: {
        peak_sales_hour: timeSlots.peak_sales_hour || null,
        quiet_hour: timeSlots.quiet_hour || null,
        breakdown: Array.isArray(timeSlots.breakdown) ? timeSlots.breakdown.slice(0, 6) : []
      },
      candidate_actions: candidateActions
    },
    fallbackInsight
  );

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
  const scope = await enrichScope(getScopeRequest(body));
  return buildAndSaveScopeInsight(scope);
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

  if (query.all) {
    const result = await listLatestAiInsightRecords({
      scope_type: query.scope_type || null,
      page: query.page || 1,
      limit: query.limit || 50
    });
    const items = result.rows.map(mapRecordToResponse);

    return {
      summary: {
        total_items: result.total,
        global_count: items.filter((item) => item.scope.type === "global").length,
        city_count: items.filter((item) => item.scope.type === "city").length,
        cinema_count: items.filter((item) => item.scope.type === "cinema").length,
        studio_count: items.filter((item) => item.scope.type === "studio").length
      },
      pagination: {
        page: result.page,
        limit: result.limit,
        total_items: result.total,
        total_pages: result.total > 0 ? Math.ceil(result.total / result.limit) : 0
      },
      items
    };
  }

  const scope = await enrichScope(getScopeRequest(query));

  try {
    const record = await getLatestAiInsightRecord({
      scope_type: scope.scope_type,
      scope_value: scope.scope_value || ""
    });
    return mapRecordToResponse(record);
  } catch (error) {
    if (error?.errorCode === "NOT_FOUND") {
      return buildAndSaveScopeInsight(scope);
    }

    throw error;
  }
}

export async function getAiInsightHistory(query = {}) {
  await ensureAiInsightsTable();
  const scope = await enrichScope(getScopeRequest(query));
  const useScopeValue = Boolean(query.city || query.cinema_id || query.studio_id);
  const result = await listAiInsightHistoryRecords({
    scope_type: query.scope_type || scope.scope_type || null,
    scope_value: scope.scope_value || "",
    useScopeValue,
    start_date: query.start_date || null,
    end_date: query.end_date || null,
    page: query.page || 1,
    limit: query.limit || 50
  });

  return {
    summary: {
      total_items: result.total
    },
    pagination: {
      page: result.page,
      limit: result.limit,
      total_items: result.total,
      total_pages: result.total > 0 ? Math.ceil(result.total / result.limit) : 0
    },
    items: result.rows.map(mapRecordToResponse)
  };
}
