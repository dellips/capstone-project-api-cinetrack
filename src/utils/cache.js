import { config } from "../config.js";
import { getRedisClient } from "../redis.js";

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

export async function withCache(namespace, params, ttlSeconds, fetcher) {
  if (!config.cacheEnabled || !config.redisUrl) {
    return fetcher();
  }

  const key = buildCacheKey(namespace, params);
  const client = await getRedisClient();

  if (!client) {
    return fetcher();
  }

  try {
    const cachedValue = await client.get(key);

    if (cachedValue) {
      return JSON.parse(cachedValue);
    }
  } catch (error) {
    console.error(`Redis get failed for ${key}:`, error.message);
  }

  const freshValue = await fetcher();

  try {
    await client.set(key, JSON.stringify(freshValue), {
      EX: ttlSeconds
    });
  } catch (error) {
    console.error(`Redis set failed for ${key}:`, error.message);
  }

  return freshValue;
}
