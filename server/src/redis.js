import Redis from 'ioredis';

// Cache is an optimisation only: if Redis is down, requests fall through to MongoDB with no errors.
const client = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      retryStrategy: () => 2000,
    })
  : null;

client?.on('error', () => {
  // Silent fallback to Mongo on Redis connection errors
});

export async function cached(key, ttlSeconds, loader) {
  try {
    if (client && client.status === 'ready') {
      const hit = await client.get(key);
      if (hit) return JSON.parse(hit);
    }
  } catch {
    // Ignore cache failure and fetch directly from database
  }

  const value = await loader();

  try {
    if (client && client.status === 'ready') {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
  } catch {
    // Ignore cache write failure
  }

  return value;
}

export async function invalidate(...keys) {
  try {
    if (client && client.status === 'ready' && keys.length) {
      await client.del(...keys);
    }
  } catch {
    // Ignore invalidation failure
  }
}

export function isRedisReady() {
  return Boolean(client && client.status === 'ready');
}
