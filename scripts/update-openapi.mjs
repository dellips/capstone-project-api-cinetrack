import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.resolve(__dirname, "../openapi.json");

// Menyediakan bentuk response sukses generik agar definisi path baru tetap ringkas.
function successResponse(example, description = "Request success") {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/SuccessEnvelope"
        },
        example
      }
    }
  };
}

// Menyusun parameter query sederhana supaya definisi endpoint baru tetap konsisten.
function queryParam(name, type = "string", extra = {}) {
  return {
    name,
    in: "query",
    required: false,
    schema: {
      type,
      ...extra
    }
  };
}

// Menyusun parameter path sederhana untuk endpoint detail tambahan.
function pathParam(name) {
  return {
    name,
    in: "path",
    required: true,
    schema: {
      type: "string"
    }
  };
}

// Menuliskan seluruh path baru yang belum tercakup di openapi statis.
function buildNewPaths() {
  return {
    "/tickets": {
      get: {
        tags: ["Tickets"],
        summary: "List tickets",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          queryParam("schedule_id"),
          queryParam("movie_id"),
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("payment_type"),
          queryParam("seat_category"),
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" }
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: [
              {
                ticket_id: "T00000001",
                schedule_id: "S000001",
                movie_id: "M001",
                cinema_id: "C001",
                seat_category: "Regular",
                final_price: 45000,
                trans_time: "2026-05-14T12:00:00.000Z",
                payment_type: "QRIS",
                status: "success",
                is_mock_status: true
              }
            ],
            meta: {
              filters: {
                schedule_id: null,
                movie_id: null,
                cinema_id: null
              },
              pagination: {
                page: 1,
                limit: 20,
                total: 1,
                total_pages: 1
              }
            }
          }, "Ticket list")
        }
      }
    },
    "/tickets/{ticket_id}": {
      get: {
        tags: ["Tickets"],
        summary: "Get ticket detail",
        parameters: [pathParam("ticket_id")],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              ticket_id: "T00000001",
              schedule_id: "S000001",
              movie_id: "M001",
              cinema_id: "C001",
              seat_category: "Regular",
              final_price: 45000,
              trans_time: "2026-05-14T12:00:00.000Z",
              payment_type: "QRIS",
              status: "success",
              is_mock_status: true
            }
          }, "Ticket detail"),
          "404": { $ref: "#/components/responses/ErrorResponse" }
        }
      }
    },
    "/system/status": {
      get: {
        tags: ["System"],
        summary: "Get cinema node status summary",
        responses: {
          "200": successResponse({
            success: true,
            data: {
              system: {
                status: "active",
                last_data_in: "2026-05-14T12:00:00.000Z",
                tickets_last_hour: 334677
              },
              summary: {
                total_nodes: 20,
                active_nodes: 20,
                inactive_nodes: 0,
                down_nodes: 0,
                health_rate: 100
              },
              nodes: [
                {
                  cinema_id: "C001",
                  cinema_name: "Semarang Mall 1 XXI",
                  city: "Semarang",
                  status: "active",
                  heartbeat_at: "2026-05-14T12:00:00.000Z",
                  last_sync: "2026-05-14T12:00:00.000Z",
                  is_mock_node_status: true
                }
              ]
            }
          }, "System status")
        }
      }
    },
    "/payments/config": {
      get: {
        tags: ["Support"],
        summary: "List payment configuration",
        responses: {
          "200": successResponse({
            success: true,
            data: [
              {
                payment_type: "QRIS",
                admin_fee: 1000,
                success_rate: 100,
                failure_rate: 0,
                is_mock_config: true
              }
            ]
          }, "Payment config list")
        }
      }
    },
    "/cities": {
      get: {
        tags: ["Support"],
        summary: "List supported cities for maps and filters",
        responses: {
          "200": successResponse({
            success: true,
            data: [
              {
                city: "Bandung",
                total_cinemas: 8,
                lat: null,
                lng: null,
                is_mock_location: true
              }
            ]
          }, "City list")
        }
      }
    },
    "/dashboard/executive": {
      get: {
        tags: ["Dashboard"],
        summary: "Get executive dashboard summary",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              system_status: {
                status: "active",
                last_update: "2026-05-14T12:00:00.000Z",
                health_rate: 100
              },
              active_vs_inactive_cinema: {
                total: 20,
                active: 20,
                inactive: 0,
                maintenance: 0,
                down: 0,
                is_mock_maintenance: true
              },
              franchise_performance: [],
              city_revenue_summary: [],
              top_film_contribution: [],
              alert_summary: {
                critical: 0,
                warning: 0,
                info: 2,
                unread: 0
              }
            }
          }, "Executive dashboard")
        }
      }
    },
    "/dashboard/sales/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Get sales overview metrics",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          queryParam("period", "string", { enum: ["daily", "weekly", "monthly"] }),
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              total_revenue: 318897536,
              total_tickets: 7847,
              avg_ticket_price: 40639.47,
              revenue_per_seat: 8858.27,
              avg_occupancy: 19.81,
              growth: {
                tickets: 10.01,
                revenue: 17.6,
                avg_occupancy: 1.59
              }
            }
          }, "Sales overview")
        }
      }
    },
    "/dashboard/sales/revenue-by-cinema": {
      get: {
        tags: ["Dashboard"],
        summary: "Get revenue breakdown by cinema",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" }
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_cinemas: 20,
                active_cinemas: 20
              },
              top_performing_cinema: {
                rank: 1,
                cinema_id: "C001",
                cinema_name: "Semarang Mall 1 XXI",
                city: "Semarang",
                total_revenue: 12500000,
                total_tickets: 280,
                contribution: 6.5,
                top_movie: null
              },
              lowest_performing_cinema: null,
              breakdown: []
            }
          }, "Revenue by cinema")
        }
      }
    },
    "/dashboard/sales/revenue-by-studio": {
      get: {
        tags: ["Dashboard"],
        summary: "Get revenue breakdown by studio",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_studios: 12,
                active_studios: 12,
                total_revenue: 318897536
              },
              top_performing_studio: {
                rank: 1,
                studio_id: "ST-C001-1",
                studio_name: "Studio 1",
                cinema_id: "C001",
                cinema_name: "Semarang Mall 1 XXI",
                city: "Semarang",
                total_shows: 24,
                total_tickets: 1520,
                total_revenue: 71250000,
                avg_revenue_per_show: 2968750,
                occupancy: 53.1
              },
              lowest_performing_studio: null,
              breakdown: []
            }
          }, "Revenue by studio")
        }
      }
    },
    "/dashboard/sales/revenue-by-movie": {
      get: {
        tags: ["Dashboard"],
        summary: "Get revenue breakdown by movie",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("top_n", "integer", { minimum: 1 })
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              total_movies: 8,
              top_movie: {
                rank: 1,
                movie_id: "M005",
                title: "Siksa Kubur",
                total_revenue: 132880000,
                total_tickets: 2516,
                contribution: 17.2
              },
              breakdown: []
            }
          }, "Revenue by movie")
        }
      }
    },
    "/dashboard/sales/time-slots": {
      get: {
        tags: ["Dashboard"],
        summary: "Get sales metrics by time slot",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              peak_sales_hour: {
                time_slot: "18:00",
                revenue: 210605000,
                demand: 3976,
                occupancy: 44.18,
                normalized_demand: 1,
                normalized_revenue: 1,
                optimization_score: 0.2,
                recommendation: "Pertahankan slot ini sambil memantau perubahan demand."
              },
              quiet_hour: {
                time_slot: "15:00",
                revenue: 151545000,
                demand: 2859,
                occupancy: 31.77,
                normalized_demand: 0,
                normalized_revenue: 0,
                optimization_score: 0
              },
              breakdown: []
            }
          }, "Sales time slots")
        }
      }
    },
    "/dashboard/sales/trend": {
      get: {
        tags: ["Dashboard"],
        summary: "Get sales trend with moving average and forecast",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          queryParam("group_by", "string", { enum: ["daily", "monthly"] }),
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                group_by: "daily",
                total_revenue: 318897536,
                total_tickets: 7847
              },
              forecast: {
                group_by: "daily",
                next_period: "next_period",
                projected_revenue: 103000000,
                is_mock_forecast: true
              },
              breakdown: []
            }
          }, "Sales trend")
        }
      }
    },
    "/dashboard/sales/weekend-vs-weekday": {
      get: {
        tags: ["Dashboard"],
        summary: "Compare weekend and weekday sales performance",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                winning_period: "weekend",
                revenue_gap: 28500000,
                ticket_gap: 530
              },
              breakdown: [
                {
                  day_type: "weekday",
                  total_shows: 80,
                  total_tickets: 4200,
                  total_revenue: 172400000,
                  avg_revenue_per_show: 2155000,
                  avg_tickets_per_show: 52.5,
                  occupancy: 31.8
                },
                {
                  day_type: "weekend",
                  total_shows: 40,
                  total_tickets: 4730,
                  total_revenue: 200900000,
                  avg_revenue_per_show: 5022500,
                  avg_tickets_per_show: 118.25,
                  occupancy: 48.2
                }
              ]
            }
          }, "Weekend vs weekday performance")
        }
      }
    },
    "/dashboard/sales/payment": {
      get: {
        tags: ["Dashboard"],
        summary: "Get payment preference and profitability",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("payment_type")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              total_transactions: 7847,
              preferred_payment: {
                payment_type: "QRIS",
                total_transactions: 3500,
                usage_rate: 44.6,
                gross_revenue: 145000000,
                avg_price: 41428.57,
                admin_fee: 1000,
                success_rate: 100,
                failure_rate: 0,
                net_profitability: 141500000,
                is_mock_config: true
              },
              breakdown: []
            }
          }, "Sales payment metrics")
        }
      }
    },
    "/dashboard/sales/operational-risk": {
      get: {
        tags: ["Dashboard"],
        summary: "Get sales operational risk summary",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_shows: 100,
                cancelled: 2,
                delayed: 1,
                avg_delay_minutes: null,
                problematic_rate: 3,
                is_mock_delay: true
              },
              problematic_schedules: []
            }
          }, "Sales operational risk")
        }
      }
    },
    "/dashboard/films/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Get films overview metrics",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              active_films: 8,
              total_shows: 120,
              tickets_sold: 7847,
              revenue: 318897536,
              avg_occupancy: 19.81,
              growth: {
                tickets: 10.01,
                revenue: 17.6,
                avg_occupancy: 1.59
              }
            }
          }, "Films overview")
        }
      }
    },
    "/dashboard/films/performance": {
      get: {
        tags: ["Dashboard"],
        summary: "Get films performance and blockbuster ranking",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("top_n", "integer", { minimum: 1 })
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              top_movie: {
                rank: 1,
                movie_id: "M005",
                title: "Siksa Kubur",
                total_tickets: 2516,
                total_revenue: 132880000,
                blockbuster_score: 54628307.2
              },
              breakdown: []
            }
          }, "Films performance")
        }
      }
    },
    "/dashboard/films/schedules": {
      get: {
        tags: ["Dashboard"],
        summary: "Get film schedule performance and audience density",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              schedule_performance: [],
              repeat_schedule_performance: [],
              audience_density: []
            }
          }, "Film schedules analytics")
        }
      }
    },
    "/dashboard/films/occupancy": {
      get: {
        tags: ["Dashboard"],
        summary: "Get films occupancy breakdown",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              overall: {
                group_by: "daily",
                total_tickets: 7847,
                total_capacity: 36000,
                occupancy: 19.81
              },
              by_movie: [],
              by_day: [],
              by_studio: []
            }
          }, "Films occupancy")
        }
      }
    },
    "/dashboard/films/distribution": {
      get: {
        tags: ["Dashboard"],
        summary: "Get genre popularity and studio format distribution",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              genre_popularity: {
                summary: {
                  total_movies_showing: 8,
                  total_tickets_sold: 7847,
                  top_movie: null,
                  top_genre: null
                },
                breakdown: [],
                breakdown_rating_usia: []
              },
              studio_format_distribution: []
            }
          }, "Films distribution")
        }
      }
    },
    "/dashboard/films/operational-risk": {
      get: {
        tags: ["Dashboard"],
        summary: "Get film operational risk summary",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_shows: 100,
                cancelled: 2,
                delayed: 1,
                avg_delay_minutes: null,
                problematic_rate: 3,
                is_mock_delay: true
              },
              impacted_movies: [],
              problematic_schedules: []
            }
          }, "Films operational risk")
        }
      }
    },
    "/dashboard/notifications": {
      get: {
        tags: ["Dashboard"],
        summary: "List dashboard notifications",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          queryParam("status", "string", { enum: ["read", "unread", "all"] }),
          queryParam("severity", "string", { enum: ["info", "warning", "critical", "success"] })
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: [
              {
                type: "system-health",
                severity: "success",
                title: "Backend health",
                what_happened: "Backend is active and responding normally.",
                where: "network",
                impact_size: 334677,
                recommended_action: "Cek konektivitas backend, database, dan sinkronisasi data.",
                created_at: "2026-04-10T08:15:33.194Z",
                status: "read",
                resolved: true
              }
            ],
            meta: {
              filters: {
                status: "all",
                severity: null
              },
              pagination: {
                page: 1,
                limit: 20,
                total: 4,
                total_pages: 1
              }
            }
          }, "Dashboard notifications")
        }
      }
    },
    "/analytics/pricing-recommendation": {
      get: {
        tags: ["Analytics"],
        summary: "Get pricing recommendation by time slot",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id"),
          queryParam("top_n", "integer", { minimum: 1 })
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_slots_analyzed: 4,
                recommended_changes: 2,
                peak_sales_hour: null,
                quiet_hour: null,
                is_rule_based: true
              },
              recommendations: []
            }
          }, "Pricing recommendation")
        }
      }
    },
    "/analytics/best-ad-slot": {
      get: {
        tags: ["Analytics"],
        summary: "Rank best ad slot candidates by audience proxy",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("movie_id"),
          queryParam("top_n", "integer", { minimum: 1 })
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_candidates: 20,
                top_slot: {
                  movie_id: "M005",
                  title: "Siksa Kubur",
                  genre: ["Horror"],
                  time_slot: "18:00",
                  total_shows: 14,
                  audience_size: 1090,
                  total_revenue: 57575000,
                  revenue_per_show: 4112500,
                  occupancy: 66.7,
                  ad_score: 100,
                  is_rule_based: true,
                  is_proxy_metric: true
                },
                scoring_formula: "0.5*audience + 0.3*revenue + 0.2*occupancy",
                is_proxy_metric: true
              },
              breakdown: []
            }
          }, "Best ad slot analytics")
        }
      }
    },
    "/analytics/early-blockbuster": {
      get: {
        tags: ["Analytics"],
        summary: "Detect early blockbuster candidates",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("min_tickets", "integer", { minimum: 1 }),
          queryParam("min_growth", "number")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                min_tickets: 100,
                min_growth: 25,
                detected_movies: 2,
                is_rule_based: true
              },
              breakdown: []
            }
          }, "Early blockbuster analytics")
        }
      }
    },
    "/analytics/cannibalization": {
      get: {
        tags: ["Analytics"],
        summary: "Detect possible show cannibalization",
        parameters: [
          { $ref: "#/components/parameters/StartDateParam" },
          { $ref: "#/components/parameters/EndDateParam" },
          { $ref: "#/components/parameters/CityParam" },
          { $ref: "#/components/parameters/CinemaIdQueryParam" },
          queryParam("studio_id"),
          queryParam("min_competitor_occupancy", "number"),
          queryParam("max_impacted_occupancy", "number")
        ],
        responses: {
          "200": successResponse({
            success: true,
            data: {
              summary: {
                total_slots_analyzed: 80,
                possible_cannibalization_cases: 0,
                is_rule_based: true
              },
              breakdown: []
            }
          }, "Cannibalization analytics")
        }
      }
    }
  };
}

async function main() {
  const spec = JSON.parse(await fs.readFile(openApiPath, "utf8"));
  const tags = new Set((spec.tags || []).map((item) => item.name));

  for (const name of ["Tickets", "Dashboard", "Support"]) {
    if (!tags.has(name)) {
      spec.tags.push({ name });
    }
  }

  Object.assign(spec.paths, buildNewPaths());

  await fs.writeFile(openApiPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`Updated ${openApiPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
