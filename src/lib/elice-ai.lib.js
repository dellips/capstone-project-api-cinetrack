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

function buildFallbackInsight(summary) {
  const occupancy = Number(summary.avg_occupancy || 0);
  const revenueGrowth = Number(summary.growth?.revenue || 0);
  const ticketGrowth = Number(summary.growth?.tickets || 0);

  if (occupancy < 35) {
    return {
      title: "Low occupancy needs immediate showtime optimization",
      description:
        `The last 14 days show average occupancy at ${roundNumber(occupancy)}%, which indicates underused capacity.`,
      recommendation: "Reduce weak showtimes, move high-demand titles to stronger slots, and tighten studio allocation.",
      action_items: [
        "Review low-performing showtimes and reduce frequency where needed.",
        "Reallocate stronger titles into the weakest occupancy slots.",
        "Use promotions only on sessions with consistently weak demand."
      ],
      impact_level: "high",
      category: "occupancy"
    };
  }

  if (revenueGrowth < 0 || ticketGrowth < 0) {
    return {
      title: "Demand is softening and needs commercial intervention",
      description:
        `Ticket growth is ${roundNumber(ticketGrowth)}% and revenue growth is ${roundNumber(revenueGrowth)}% over the last 14 days.`,
      recommendation: "Refresh promotional tactics, review pricing discipline, and concentrate capacity around proven demand.",
      action_items: [
        "Evaluate campaign performance for the weakest 14-day periods.",
        "Test targeted discounts only for low-conversion slots.",
        "Shift staffing and show allocation toward stronger sessions."
      ],
      impact_level: "medium",
      category: "growth"
    };
  }

  return {
    title: "Performance is stable with room to monetize stronger demand",
    description:
      `Revenue and ticket performance are stable across the last 14 days, with occupancy at ${roundNumber(occupancy)}%.`,
    recommendation: "Protect high-performing slots and test selective pricing or upsell tactics on the strongest sessions.",
    action_items: [
      "Maintain top-performing sessions and avoid unnecessary price cuts.",
      "Test mild price uplift on the strongest demand windows.",
      "Monitor occupancy shifts before expanding schedule volume."
    ],
    impact_level: "medium",
    category: "revenue"
  };
}

function normalizeInsight(item, fallback) {
  const impactLevel = String(item?.impact_level || fallback.impact_level || "medium").toLowerCase();
  const category = String(item?.category || fallback.category || "growth").toLowerCase();
  const actionItems = Array.isArray(item?.action_items)
    ? item.action_items.map((value) => String(value || "").trim()).filter(Boolean)
    : fallback.action_items;

  return {
    title: String(item?.title || fallback.title).trim(),
    description: String(item?.description || fallback.description).trim(),
    recommendation: String(item?.recommendation || fallback.recommendation).trim(),
    action_items: actionItems.length > 0 ? actionItems : fallback.action_items,
    impact_level: ["low", "medium", "high"].includes(impactLevel) ? impactLevel : fallback.impact_level,
    category: ["occupancy", "revenue", "tickets", "growth"].includes(category) ? category : fallback.category
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
You are a professional cinema business analyst.

Analyze the aggregated 14-day cinema business data below and return one strategic insight in valid JSON.

You must identify:
- the most important business signal
- why it matters
- the best next action to take

Data:
${JSON.stringify(payload, null, 2)}

Return valid JSON only with this exact shape:
{
  "title": "string",
  "description": "string",
  "recommendation": "string",
  "action_items": ["string", "string", "string"],
  "impact_level": "low|medium|high",
  "category": "occupancy|revenue|tickets|growth"
}

Rules:
- Use English only.
- Be concise and action-oriented.
- Refer to films by title only, never by movie_id or internal code.
- Do not use markdown.
- Do not add any text outside the JSON object.
`.trim();
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

function buildCandidateUrls() {
  const exact = config.aiBaseUrl.replace(/\/$/, "");
  const chatPath = `${exact}/chat/completions`;

  return [...new Set([chatPath, exact])];
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

export async function generateInsightFromAi(aiInput) {
  const fallback = buildFallbackInsight(aiInput.summary);

  if (!config.aiApiKey || !config.aiBaseUrl) {
    return {
      source: "fallback",
      model: "fallback-local",
      insight: fallback
    };
  }

  const prompt = buildPrompt(aiInput);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);

  try {
    const payload = {
      model: config.aiModel,
      messages: [
        {
          role: "system",
          content: "You are an efficient and highly practical cinema business analyst."
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
        const result = await postJson(url, payload, controller.signal);
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
  } finally {
    clearTimeout(timeout);
  }
}
