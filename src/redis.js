import { createClient } from "redis";
import { config } from "./config.js";

let client = null;
let connectingPromise = null;
let redisDisabledReason = null;
let redisErrorLogged = false;

function disableRedis(reason) {
  redisDisabledReason = reason || "unknown";

  if (!redisErrorLogged) {
    console.error(`Redis disabled: ${redisDisabledReason}`);
    redisErrorLogged = true;
  }

  connectingPromise = null;

  if (client) {
    client.removeAllListeners();
  }

  client = null;
}

export function markRedisUnavailable(reason) {
  disableRedis(reason);
}

function isFatalRedisError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("enotfound")
    || message.includes("getaddrinfo")
    || message.includes("connection timeout")
    || message.includes("econnrefused")
    || message.includes("max number of clients reached")
    || message.includes("socket closed unexpectedly")
  );
}

function createRedisClient() {
  if (!config.cacheEnabled || !config.redisUrl) {
    return null;
  }

  if (redisDisabledReason) {
    return null;
  }

  try {
    new URL(config.redisUrl);
  } catch {
    disableRedis("REDIS_URL is invalid");
    return null;
  }

  const redisClient = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: config.redisConnectTimeoutMs
    }
  });

  redisClient.on("error", (error) => {
    if (isFatalRedisError(error)) {
      disableRedis(error.message);
      return;
    }

    console.error("Redis error:", error.message);
  });

  return redisClient;
}

export async function getRedisClient() {
  if (!config.cacheEnabled || !config.redisUrl) {
    return null;
  }

  if (redisDisabledReason) {
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
    if (isFatalRedisError(error)) {
      disableRedis(error.message);
      return null;
    }

    console.error("Redis connection failed:", error.message);
    return null;
  }
}

export async function closeRedisClient() {
  if (client?.isOpen) {
    await client.quit();
  }
}
