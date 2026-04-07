import { createClient } from "redis";
import { config } from "./config.js";

let client = null;
let connectingPromise = null;

function createRedisClient() {
  if (!config.cacheEnabled || !config.redisUrl) {
    return null;
  }

  try {
    new URL(config.redisUrl);
  } catch {
    console.error("Redis disabled: REDIS_URL is invalid");
    return null;
  }

  const redisClient = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: config.redisConnectTimeoutMs
    }
  });

  redisClient.on("error", (error) => {
    console.error("Redis error:", error.message);
  });

  return redisClient;
}

export async function getRedisClient() {
  if (!config.cacheEnabled || !config.redisUrl) {
    return null;
  }

  if (!client) {
    client = createRedisClient();
  }

  if (!client) {
    return null;
  }

  if (client.isOpen) {
    return client;
  }

  if (!connectingPromise) {
    connectingPromise = client.connect().finally(() => {
      connectingPromise = null;
    });
  }

  try {
    await connectingPromise;
    return client;
  } catch (error) {
    console.error("Redis connection failed:", error.message);
    return null;
  }
}

export async function closeRedisClient() {
  if (client?.isOpen) {
    await client.quit();
  }
}
