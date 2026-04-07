const nonEmptyString = { type: "string", minLength: 1 };

// Menyusun schema query statistik dasar agar semua endpoint analytics berbagi validasi yang sama.
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

export const baseRouteSchemas = {
  root: {},
  movies: {},
  studios: {},
  schedules: {},
  tikets: {},
  movieRankings: {
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        top10: { type: "boolean" },
        city: nonEmptyString,
        cinema_id: nonEmptyString
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
        password: nonEmptyString
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
        city: nonEmptyString,
        cinema_id: nonEmptyString
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
        movie_id: nonEmptyString
      }
    }
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
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: nonEmptyString,
        cinema_id: nonEmptyString,
        rating_usia: nonEmptyString
      }
    }
  }
};
