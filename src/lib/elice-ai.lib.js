import { config } from "../config.js";

function cleanJsonText(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const withoutFence = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace >= firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  return withoutFence;
}

function roundNumber(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeRecommendedAction(item = {}) {
  const actionType = String(item.action_type || "keep_monitoring").trim().toLowerCase();
  const priority = String(item.priority || "medium").trim().toLowerCase();
  const badge = getActionBadge(actionType);

  return {
    action_type: actionType,
    priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
    title: String(item.title || "").trim(),
    description: String(item.description || "").trim(),
    reason: String(item.reason || "").trim(),
    expected_impact: String(item.expected_impact || "").trim(),
    city: item.city ? String(item.city).trim() : null,
    cinema_name: item.cinema_name ? String(item.cinema_name).trim() : null,
    studio_name: item.studio_name ? String(item.studio_name).trim() : null,
    movie_title: item.movie_title ? String(item.movie_title).trim() : null,
    schedule_time: item.schedule_time ? String(item.schedule_time).trim() : null,
    occupancy: item.occupancy != null ? roundNumber(item.occupancy) : null,
    color: item.color || badge.color,
    icon: item.icon || badge.icon
  };
}

function getActionBadge(actionType) {
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

function buildFallbackInsight(summary, fallbackInsight = null) {
  if (fallbackInsight) {
    return fallbackInsight;
  }

  const occupancy = Number(summary.avg_occupancy || 0);
  const revenueGrowth = Number(summary.growth?.revenue || 0);
  const ticketGrowth = Number(summary.growth?.tickets || 0);

  if (occupancy < 35) {
    return {
      title: "Low occupancy needs immediate showtime optimization",
      description: `The last 14 days show average occupancy at ${roundNumber(occupancy)}%, which indicates underused capacity.`,
      recommendation: "Reduce weak showtimes, move stronger titles into better sessions, and tighten studio allocation.",
      action_items: [
        "Review the weakest sessions and reduce frequency where needed.",
        "Reallocate stronger titles into better-performing slots.",
        "Use promotions only on sessions with persistent low demand."
      ],
      impact_level: "high",
      category: "occupancy",
      recommended_actions: []
    };
  }

  if (revenueGrowth < 0 || ticketGrowth < 0) {
    return {
      title: "Demand is softening and needs commercial intervention",
      description: `Ticket growth is ${roundNumber(ticketGrowth)}% and revenue growth is ${roundNumber(revenueGrowth)}% over the last 14 days.`,
      recommendation: "Refresh commercial tactics, review pricing discipline, and concentrate capacity around proven demand.",
      action_items: [
        "Evaluate campaign performance for the weakest sessions.",
        "Test targeted discounts only where conversion stays weak.",
        "Shift capacity toward stronger sessions."
      ],
      impact_level: "medium",
      category: "growth",
      recommended_actions: []
    };
  }

  return {
    title: "Performance is stable with room to monetize stronger demand",
    description: `Revenue and ticket performance are stable over the last 14 days, with average occupancy at ${roundNumber(occupancy)}%.`,
    recommendation: "Protect high-performing slots and test selective pricing or upsell tactics on the strongest sessions.",
    action_items: [
      "Maintain top-performing sessions and avoid unnecessary price cuts.",
      "Test mild price uplifts on the strongest demand windows.",
      "Monitor occupancy changes before expanding schedule volume."
    ],
    impact_level: "medium",
    category: "revenue",
    recommended_actions: []
  };
}

function normalizeInsight(item, fallback) {
  const impactLevel = String(item?.impact_level || fallback.impact_level || "medium").toLowerCase();
  const category = String(item?.category || fallback.category || "growth").toLowerCase();
  const actionItems = Array.isArray(item?.action_items)
    ? item.action_items.map((value) => String(value || "").trim()).filter(Boolean)
    : fallback.action_items;
  const recommendedActions = Array.isArray(item?.recommended_actions)
    ? item.recommended_actions.map(normalizeRecommendedAction).filter((action) => action.title && action.description)
    : (Array.isArray(fallback.recommended_actions) ? fallback.recommended_actions.map(normalizeRecommendedAction) : []);

  return {
    title: String(item?.title || fallback.title).trim(),
    description: String(item?.description || fallback.description).trim(),
    recommendation: String(item?.recommendation || fallback.recommendation).trim(),
    action_items: actionItems.length > 0 ? actionItems : fallback.action_items,
    impact_level: ["low", "medium", "high"].includes(impactLevel) ? impactLevel : fallback.impact_level,
    category: ["occupancy", "revenue", "tickets", "growth"].includes(category) ? category : fallback.category,
    recommended_actions: recommendedActions
  };
}

function parseInsightResponse(rawText, fallback) {
  try {
    const parsed = JSON.parse(cleanJsonText(rawText));
    return normalizeInsight(parsed, fallback);
  } catch {
    return fallback;
  }
}

function buildPrompt(payload) {
  return `
You are a cinema operations analyst.
Review this 14-day business snapshot and return one concise operational insight in English.
Use candidate_actions as the main source of truth.
Do not invent entities.
Never mention internal IDs or codes.
Always use movie titles and location names only.

Data:
${JSON.stringify(payload)}

Return valid JSON only with this exact shape:
{
  "title": "string",
  "description": "string",
  "recommendation": "string",
  "action_items": ["string", "string", "string"],
  "impact_level": "low|medium|high",
  "category": "occupancy|revenue|tickets|growth",
  "recommended_actions": [
    {
      "action_type": "move_to_larger_studio|reduce_showtimes|promotion_opportunity|premium_pricing|keep_monitoring",
      "priority": "low|medium|high",
      "title": "string",
      "description": "string",
      "reason": "string",
      "expected_impact": "string",
      "city": "string|null",
      "cinema_name": "string|null",
      "studio_name": "string|null",
      "movie_title": "string|null",
      "schedule_time": "HH:MM|null"
    }
  ]
}

Rules:
- Use English only.
- Be concise, operational, and actionable.
- Prefer up to 3 recommended_actions.
- Use the candidate_actions list when choosing operational actions.
- If the data signal is weak, use cautious recommendations.
- Do not use markdown.
- Do not add any text outside the JSON object.
`.trim();
}

function buildAiPayloadSnapshot(payload) {
  return {
    scope: payload.scope,
    summary: payload.summary,
    ad_score: {
      summary: payload.ad_score?.summary || {},
      top_slots: Array.isArray(payload.ad_score?.top_slots) ? payload.ad_score.top_slots.slice(0, 2) : []
    },
    pricing_recommendation: {
      summary: payload.pricing_recommendation?.summary || {},
      recommendations: Array.isArray(payload.pricing_recommendation?.recommendations)
        ? payload.pricing_recommendation.recommendations.slice(0, 2)
        : []
    },
    time_slots: {
      peak_sales_hour: payload.time_slots?.peak_sales_hour || null,
      quiet_hour: payload.time_slots?.quiet_hour || null
    },
    candidate_actions: Array.isArray(payload.candidate_actions)
      ? payload.candidate_actions.slice(0, 4).map((item) => ({
          action_type: item.action_type,
          priority: item.priority,
          title: item.title,
          description: item.description,
          reason: item.reason,
          expected_impact: item.expected_impact,
          city: item.city,
          cinema_name: item.cinema_name,
          studio_name: item.studio_name,
          movie_title: item.movie_title,
          schedule_time: item.schedule_time,
          occupancy: item.occupancy
        }))
      : []
  };
}

async function postJson(url, payload, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiApiKey}`
    },
    body: JSON.stringify(payload),
    signal
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`AI ${response.status} ${response.statusText || ""} ${rawText}`.trim());
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

async function postJsonWithTimeout(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await postJson(url, payload, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function buildCandidateUrls() {
  const exact = config.aiBaseUrl.replace(/\/$/, "");
  if (exact.endsWith("/chat/completions")) {
    return [exact];
  }

  if (exact.endsWith("/v1")) {
    return [`${exact}/chat/completions`];
  }

  return [`${exact}/chat/completions`];
}

function extractContent(result) {
  if (typeof result === "string") {
    return result;
  }

  return (
    result?.choices?.[0]?.message?.content
    || result?.output_text
    || result?.text
    || result?.content
    || JSON.stringify(result)
  );
}

export async function generateInsightFromAi(aiInput, fallbackInsight = null) {
  const fallback = buildFallbackInsight(aiInput.summary, fallbackInsight);

  if (!config.aiApiKey || !config.aiBaseUrl) {
    return {
      source: "fallback",
      model: "fallback-local",
      insight: fallback
    };
  }

  const prompt = buildPrompt(buildAiPayloadSnapshot(aiInput));

  try {
    const payload = {
      model: config.aiModel,
      messages: [
        {
          role: "system",
          content: "You are an efficient and highly practical cinema business analyst who writes concise operational recommendations for dashboard users."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    };

    let lastError = null;

    for (const url of buildCandidateUrls()) {
      try {
        const result = await postJsonWithTimeout(url, payload, config.aiTimeoutMs);
        return {
          source: "ai",
          model: config.aiModel,
          insight: parseInsightResponse(extractContent(result), fallback)
        };
      } catch (error) {
        console.warn("AI request attempt failed:", url, error?.message || error);
        lastError = error;
      }
    }

    throw lastError || new Error("AI request failed");
  } catch (error) {
    console.error("AI insight generation failed:", error?.message || error);
    return {
      source: "fallback",
      model: config.aiModel,
      insight: fallback
    };
  }
}
