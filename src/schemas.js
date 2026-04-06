const nullableString = { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] };
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableIdString = { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] };

const messageResponseSchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" }
  }
};

const metricsSchema = {
  type: "object",
  required: ["total_tickets", "total_revenue", "avg_ticket_price"],
  properties: {
    total_tickets: { type: "integer" },
    total_revenue: { type: "number" },
    avg_ticket_price: { type: "number" }
  }
};

const statsQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    city: { type: "string", minLength: 1 },
    cinema_id: { type: "string", minLength: 1 },
    studio_id: { type: "string", minLength: 1 },
    movie_id: { type: "string", minLength: 1 }
  }
};

export const baseRouteSchemas = {
  root: {
    response: {
      200: messageResponseSchema
    }
  },
  movies: {
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["movie_id", "title", "genre", "rating_usia", "duration_min"],
          properties: {
            movie_id: { type: "string" },
            title: { type: "string" },
            genre: { type: "array", items: { type: "string" } },
            rating_usia: { type: "string" },
            duration_min: { type: "integer" }
          }
        }
      }
    }
  },
  studios: {
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["studio_id", "cinema_id", "studio_name", "total_capacity", "screen_type"],
          properties: {
            studio_id: { type: "string" },
            cinema_id: { type: "string" },
            studio_name: { type: "string" },
            total_capacity: { type: "integer" },
            screen_type: { type: "string" }
          }
        }
      }
    }
  },
  schedules: {
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["schedule_id", "movie_id", "studio_id", "show_date", "start_time", "price", "status"],
          properties: {
            schedule_id: { type: "string" },
            movie_id: { type: "string" },
            studio_id: { type: "string" },
            show_date: { type: "string" },
            start_time: { type: "string" },
            price: { type: "number" },
            status: { type: "string" }
          }
        }
      }
    }
  },
  tikets: {
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["tiket_id", "schedule_id", "seat_category", "final_price", "trans_time", "payment_type"],
          properties: {
            tiket_id: { type: "string" },
            schedule_id: { type: "string" },
            seat_category: { type: "string" },
            final_price: { type: "number" },
            trans_time: { type: "string" },
            payment_type: { type: "string" }
          }
        }
      }
    }
  },
  movieRankings: {
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        top10: { type: "boolean" },
        city: { type: "string", minLength: 1 },
        cinema_id: { type: "string", minLength: 1 }
      }
    },
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          required: ["movie_id", "title", "genre", "rating_usia", "duration_min", "tickets_sold", "revenue"],
          properties: {
            movie_id: { type: "string" },
            title: { type: "string" },
            genre: { type: "array", items: { type: "string" } },
            rating_usia: { type: "string" },
            duration_min: { type: "integer" },
            tickets_sold: { type: "integer" },
            revenue: { type: "number" }
          }
        }
      }
    }
  }
};

export const authRouteSchemas = {
  login: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 1 }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["message", "token", "user"],
        properties: {
          message: { type: "string" },
          token: { type: "string" },
          user: {
            type: "object",
            required: ["email", "role"],
            properties: {
              email: { type: "string" },
              role: { type: "string" }
            }
          }
        }
      }
    }
  }
};

export const cinemaRouteSchemas = {
  cinemas: {
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: { type: "string", minLength: 1 },
        cinema_id: { type: "string", minLength: 1 }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["filters", "summary", "breakdown"],
        properties: {
          filters: {
            type: "object",
            required: ["city", "cinema_id"],
            properties: {
              city: nullableString,
              cinema_id: nullableIdString
            }
          },
          summary: {
            type: "object",
            required: ["total_cinemas", "active_cinemas", "total_tickets", "total_revenue"],
            properties: {
              total_cinemas: { type: "integer" },
              active_cinemas: { type: "integer" },
              total_tickets: { type: "integer" },
              total_revenue: { type: "number" }
            }
          },
          breakdown: {
            type: "array",
            items: {
              type: "object",
              required: ["cinema_id", "cinema_name", "city", "address", "metrics", "top_movie", "top_genre"],
              properties: {
                cinema_id: { type: "string" },
                cinema_name: { type: "string" },
                city: { type: "string" },
                address: { type: "string" },
                metrics: {
                  type: "object",
                  required: ["total_tickets", "total_revenue", "active_movies", "active_studios"],
                  properties: {
                    total_tickets: { type: "integer" },
                    total_revenue: { type: "number" },
                    active_movies: { type: "integer" },
                    active_studios: { type: "integer" }
                  }
                },
                top_movie: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      required: ["movie_id", "title", "tickets_sold"],
                      properties: {
                        movie_id: { type: "string" },
                        title: { type: "string" },
                        tickets_sold: { type: "integer" }
                      }
                    }
                  ]
                },
                top_genre: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      required: ["genre", "tickets_sold"],
                      properties: {
                        genre: { type: "string" },
                        tickets_sold: { type: "integer" }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  }
};

export const movieRouteSchemas = {
  movieDetail: {
    params: {
      type: "object",
      additionalProperties: false,
      required: ["movie_id"],
      properties: {
        movie_id: { type: "string", minLength: 1 }
      }
    },
    response: {
      200: {
        anyOf: [
          {
            type: "object",
            maxProperties: 0
          },
          {
            type: "object",
            required: ["movie", "metrics", "showing_at", "seat_distribution"],
            properties: {
              movie: {
                type: "object",
                required: ["movie_id", "title", "genre", "duration_min"],
                properties: {
                  movie_id: { type: "string" },
                  title: { type: "string" },
                  genre: { type: "string" },
                  duration_min: { type: "integer" }
                }
              },
              metrics: metricsSchema,
              showing_at: {
                type: "array",
                items: { type: "string" }
              },
              seat_distribution: {
                type: "object",
                additionalProperties: {
                  type: "integer"
                }
              }
            }
          }
        ]
      }
    }
  }
};

export const statsRouteSchemas = {
  summary: {
    querystring: {
      ...statsQuerySchema,
      properties: {
        ...statsQuerySchema.properties,
        period: { type: "string", enum: ["daily", "weekly", "monthly"] },
        compare: { type: "boolean" }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["meta", "data", "growth"],
        properties: {
          meta: {
            type: "object",
            required: ["period", "filters", "scope"],
            properties: {
              period: { type: "string" },
              filters: {
                type: "object",
                required: ["city", "cinema_id", "studio_id"],
                properties: {
                  city: nullableString,
                  cinema_id: nullableIdString,
                  studio_id: nullableIdString
                }
              },
              scope: { type: "string", enum: ["global", "filtered"] }
            }
          },
          data: {
            type: "object",
            required: [
              "total_tickets",
              "revenue",
              "occupancy",
              "total_transactions",
              "cinema_aktif",
              "cinema_tersedia"
            ],
            properties: {
              total_tickets: { type: "integer" },
              revenue: { type: "number" },
              occupancy: { type: "number" },
              total_transactions: { type: "integer" },
              cinema_aktif: { type: "integer" },
              cinema_tersedia: { type: "integer" }
            }
          },
          growth: {
            type: "object",
            properties: {
              tickets: { type: "number" },
              revenue: { type: "number" },
              occupancy: { type: "number" }
            }
          }
        }
      }
    }
  },
  trends: {
    querystring: {
      ...statsQuerySchema,
      properties: {
        ...statsQuerySchema.properties,
        group_by: { type: "string", enum: ["hourly", "daily"] }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["summary", "breakdown"],
        properties: {
          summary: {
            type: "object",
            required: ["group_by", "total_tickets", "revenue", "growth"],
            properties: {
              group_by: { type: "string", enum: ["hourly", "daily"] },
              total_tickets: { type: "integer" },
              revenue: { type: "number" },
              growth: {
                type: "object",
                required: ["tickets", "revenue"],
                properties: {
                  tickets: { type: "number" },
                  revenue: { type: "number" }
                }
              }
            }
          },
          breakdown: {
            type: "array",
            items: {
              type: "object",
              required: ["time_group", "tickets_sold", "revenue"],
              properties: {
                time_group: { anyOf: [{ type: "string" }, { type: "number" }] },
                tickets_sold: { type: "integer" },
                revenue: { type: "number" }
              }
            }
          }
        }
      }
    }
  },
  occupancy: {
    querystring: {
      ...statsQuerySchema,
      properties: {
        ...statsQuerySchema.properties,
        group_by: { type: "string", enum: ["hourly", "daily"] }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["summary", "breakdown"],
        properties: {
          summary: {
            type: "object",
            required: ["group_by", "total_tickets", "total_capacity", "occupancy"],
            properties: {
              group_by: { type: "string", enum: ["hourly", "daily"] },
              total_tickets: { type: "integer" },
              total_capacity: { type: "integer" },
              occupancy: { type: "number" }
            }
          },
          breakdown: {
            type: "array",
            items: {
              type: "object",
              required: ["time_group", "total_tickets", "total_capacity", "occupancy"],
              properties: {
                time_group: { anyOf: [{ type: "string" }, { type: "number" }] },
                total_tickets: { type: "integer" },
                total_capacity: { type: "integer" },
                occupancy: { type: "number" }
              }
            }
          }
        }
      }
    }
  },
  movie: {
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: { type: "string", minLength: 1 },
        cinema_id: { type: "string", minLength: 1 },
        rating_usia: { type: "string", minLength: 1 }
      }
    },
    response: {
      200: {
        type: "object",
        required: ["filters", "summary", "breakdown_rating_usia"],
        properties: {
          filters: {
            type: "object",
            required: ["city", "cinema_id", "rating_usia"],
            properties: {
              city: nullableString,
              cinema_id: nullableIdString,
              rating_usia: nullableString
            }
          },
          summary: {
            type: "object",
            required: ["total_movies_showing", "total_tickets_sold", "top_movie", "top_genre"],
            properties: {
              total_movies_showing: { type: "integer" },
              total_tickets_sold: { type: "integer" },
              top_movie: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["movie_id", "title", "tickets_sold"],
                    properties: {
                      movie_id: { type: "string" },
                      title: { type: "string" },
                      tickets_sold: { type: "integer" }
                    }
                  }
                ]
              },
              top_genre: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["genre", "tickets_sold"],
                    properties: {
                      genre: { type: "string" },
                      tickets_sold: { type: "integer" }
                    }
                  }
                ]
              }
            }
          },
          breakdown_rating_usia: {
            type: "array",
            items: {
              type: "object",
              required: ["rating_usia", "total_tickets_sold", "total_showings"],
              properties: {
                rating_usia: { type: "string" },
                total_tickets_sold: { type: "integer" },
                total_showings: { type: "integer" }
              }
            }
          }
        }
      }
    }
  }
};

export const systemRouteSchemas = {
  health: {
    response: {
      200: {
        type: "object",
        required: ["status", "last_data_in", "tickets_last_hour"],
        properties: {
          status: { type: "string", enum: ["active", "inactive"] },
          last_data_in: nullableString,
          tickets_last_hour: { type: "integer" }
        }
      }
    }
  }
};

export const errorResponseSchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" },
    details: nullableNumber
  }
};
