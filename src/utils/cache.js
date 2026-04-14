import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { getRedisClient, markRedisUnavailable } from "../redis.js";

const cacheRequestContext = new AsyncLocalStorage();

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortValue(value[key]);
        return result;
      }, {});
  }

  return value;
}

export function buildCacheKey(namespace, params = {}) {
  return `api:v1:${namespace}:${JSON.stringify(sortValue(params))}`;
}

export function runWithCacheContext(callback) {
  return cacheRequestContext.run({ status: "BYPASS", key: null }, callback);
}

function setCacheContext(status, key = null) {
  const store = cacheRequestContext.getStore();

  if (store) {
    store.status = status;
    store.key = key;
  }
}

function isFatalRedisCacheError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("max number of clients reached")
    || message.includes("enotfound")
    || message.includes("getaddrinfo")
    || message.includes("connection timeout")
    || message.includes("econnrefused")
    || message.includes("socket closed unexpectedly")
  );
}

export function getCacheContext() {
  return cacheRequestContext.getStore();
}

export async function withCache(namespace, params, ttlSeconds, fetcher) {
  if (!config.cacheEnabled || !config.redisUrl) {
    setCacheContext("BYPASS");
    return fetcher();
  }

  const key = buildCacheKey(namespace, params);
  const client = await getRedisClient();

  if (!client) {
    setCacheContext("BYPASS", key);
    return fetcher();
  }

  try {
    const cachedValue = await client.get(key);

    if (cachedValue) {
      setCacheContext("HIT", key);
      return JSON.parse(cachedValue);
    }
  } catch (error) {
    setCacheContext("BYPASS", key);
    if (isFatalRedisCacheError(error)) {
      markRedisUnavailable(error.message);
    }
    console.error(`Redis get failed for ${key}:`, error.message);
    return fetcher();
  }

  const freshValue = await fetcher();
  setCacheContext("MISS", key);

  try {
    await client.set(key, JSON.stringify(freshValue), {
      EX: ttlSeconds
    });
  } catch (error) {
    if (isFatalRedisCacheError(error)) {
      markRedisUnavailable(error.message);
    }
    console.error(`Redis set failed for ${key}:`, error.message);
  }

  return freshValue;
}
