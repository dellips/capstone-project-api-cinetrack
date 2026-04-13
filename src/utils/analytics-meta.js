import { resolveDateRange, formatDateOnly } from "./date.js";

// Menyatukan meta analitik agar frontend bisa menampilkan label, satuan, dan konteks periode tanpa hardcode.
export function buildAnalyticsMeta(query = {}, extra = {}) {
  const range = resolveDateRange(query.start_date, query.end_date, "daily");
  const startMs = new Date(formatDateOnly(range.startDate)).getTime();
  const endMs = new Date(formatDateOnly(range.endDate)).getTime();
  const daysInclusive = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  return {
    filters: query,
    analytics_context: {
      currency: "IDR",
      locale: "id-ID",
      date_range: {
        start: formatDateOnly(range.startDate),
        end: formatDateOnly(range.endDate),
        days_inclusive: daysInclusive
      },
      units: {
        revenue: "IDR",
        tickets: "count",
        transactions: "count",
        occupancy: "percent",
        contribution: "percent",
        blockbuster_score: "normalized_0_1",
        optimization_score: "normalized_0_1"
      },
      hints: {
        occupancy_interpretation:
          "Persentase tiket terjual terhadap total kapasitas kursi pada jadwal dalam filter (seat-shows).",
        contribution_interpretation: "Pangsa pendapatan film atau bioskop terhadap total pendapatan periode yang sama."
      }
    },
    ...extra
  };
}
