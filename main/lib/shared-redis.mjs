import "server-only";
import { Redis } from "@upstash/redis";

let redisClient;

export function getSharedRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis({ url, token });
    } catch {
      return null;
    }
  }
  return redisClient;
}