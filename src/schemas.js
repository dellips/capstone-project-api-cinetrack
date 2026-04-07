const nonEmptyString = { type: "string", minLength: 1 };
const positiveInteger = { type: "integer", minimum: 1 };

// Menyusun schema query pagination dan filter umum untuk list endpoint.
function buildListQuerySchema(extraProperties = {}) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      page: positiveInteger,
      limit: positiveInteger,
      ...extraProperties
    }
  };
}

// Menyusun schema query statistik dasar agar endpoint analytics berbagi validasi yang sama.
function buildStatsQuerySchema(extraProperties = {}) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      city: nonEmptyString,
      cinema_id: nonEmptyString,
      studio_id: nonEmptyString,
      movie_id: nonEmptyString,
      ...extraProperties
    }
  };
}

// Menyusun schema params sederhana untuk endpoint detail resource tunggal.
function buildIdParamsSchema(field) {
  return {
    params: {
      type: "object",
      additionalProperties: false,
      required: [field],
      properties: {
        [field]: nonEmptyString
      }
    }
  };
}

export const baseRouteSchemas = {
  root: {},
  movies: {
    querystring: buildListQuerySchema({
      search: nonEmptyString,
      genre: nonEmptyString,
      rating_usia: nonEmptyString
    })
  },
  studios: {
    querystring: buildListQuerySchema({
      cinema_id: nonEmptyString,
      studio_id: nonEmptyString,
      screen_type: nonEmptyString
    })
  },
  studioDetail: buildIdParamsSchema("studio_id"),
  schedules: {
    querystring: buildListQuerySchema({
      movie_id: nonEmptyString,
      cinema_id: nonEmptyString,
      studio_id: nonEmptyString,
      show_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      status: nonEmptyString
    })
  },
  scheduleDetail: buildIdParamsSchema("schedule_id"),
  tikets: {
    querystring: buildListQuerySchema({
      schedule_id: nonEmptyString,
      movie_id: nonEmptyString,
      cinema_id: nonEmptyString,
      payment_type: nonEmptyString,
      seat_category: nonEmptyString,
      start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
    })
  },
  tiketDetail: buildIdParamsSchema("tiket_id"),
  movieRankings: {
    querystring: buildStatsQuerySchema({
      top10: { type: "boolean" }
    })
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
        password: nonEmptyString
      }
    }
  },
  refresh: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["refresh_token"],
      properties: {
        refresh_token: nonEmptyString
      }
    }
  },
  logout: {
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        refresh_token: nonEmptyString
      }
    }
  },
  me: {}
};

export const cinemaRouteSchemas = {
  cinemas: {
    querystring: buildListQuerySchema({
      city: nonEmptyString,
      cinema_id: nonEmptyString
    })
  },
  cinemaDetail: buildIdParamsSchema("cinema_id"),
  cinemaPerformance: {
    ...buildIdParamsSchema("cinema_id"),
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
      }
    }
  }
};

export const movieRouteSchemas = {
  movieDetail: buildIdParamsSchema("movie_id"),
  moviePerformance: {
    ...buildIdParamsSchema("movie_id"),
    querystring: buildStatsQuerySchema({})
  }
};

export const statsRouteSchemas = {
  summary: {
    querystring: buildStatsQuerySchema({
      period: { type: "string", enum: ["daily", "weekly", "monthly"] },
      compare: { type: "boolean" }
    })
  },
  trends: {
    querystring: buildStatsQuerySchema({
      group_by: { type: "string", enum: ["hourly", "daily"] }
    })
  },
  occupancy: {
    querystring: buildStatsQuerySchema({
      group_by: { type: "string", enum: ["hourly", "daily"] }
    })
  },
  movie: {
    querystring: buildStatsQuerySchema({
      rating_usia: nonEmptyString
    })
  },
  cinema: {
    querystring: buildStatsQuerySchema({})
  }
};

export const notificationRouteSchemas = {
  notifications: {
    querystring: buildListQuerySchema({
      status: { type: "string", enum: ["read", "unread", "all"] },
      severity: { type: "string", enum: ["info", "warning", "critical", "success"] },
      city: nonEmptyString,
      cinema_id: nonEmptyString
    })
  },
  notificationDetail: buildIdParamsSchema("notification_id"),
  notificationRead: buildIdParamsSchema("notification_id"),
  notificationReadAll: {},
  alertSummary: {}
};

export const settingsRouteSchemas = {
  get: {},
  patch: {
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        theme_default: { type: "string", enum: ["light", "dark", "system"] },
        refresh_interval_sec: positiveInteger
      }
    }
  }
};
